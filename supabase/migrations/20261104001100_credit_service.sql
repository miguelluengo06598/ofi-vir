-- Fase 2 · Servicio de créditos: notificaciones, consumo del mes y revisión del estado tras cada movimiento.
-- La lógica de descuento sigue en la migración anterior; aquí solo se «mira» el resultado (avisos y estado).

-- 1) Notificaciones de la empresa (de momento solo en la base; el correo real se conecta después con Resend) --
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  tipo text not null check (tipo in ('saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica')),
  titulo text not null,
  cuerpo text not null,
  metadatos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  leida_en timestamptz,
  -- Se rellenará cuando el aviso se envíe por correo (Resend).
  enviada_por_correo_en timestamptz
);
create index notifications_company_idx on public.notifications (company_id, creado_en desc);

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated
  using (company_id = (select public.current_company_id()));
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

-- 2) Créditos consumidos en el mes natural (hora de Madrid) ---------------------------------------------------
create function public.creditos_consumidos_mes(p_company_id uuid, p_ahora timestamptz default now())
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(-sum(creditos), 0)::integer
    from public.credit_ledger
   where company_id = p_company_id
     and tipo = 'consumo'
     and creado_en >= (date_trunc('month', p_ahora at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')
$$;

-- 3) Revisión del estado de créditos de una empresa --------------------------------------------------------------
-- Se llama después de cada consumo o compra. Es idempotente: recalcula desde el estado actual.
--  · Porcentaje = créditos vivos en lotes ÷ créditos iniciales del ÚLTIMO LOTE COMPRADO (pack, prueba o bono
--    mensual; los regalos y ajustes no marcan la escala). Si nunca se compró, ÷ iniciales de los lotes vivos.
--  · Cada aviso (20 %, 5 %) se anota UNA vez (marca en company_credit_settings) hasta que haya una compra nueva.
--  · Las reservas no cuentan: solo el consumo real mueve el estado.
--  · Las oficinas pausadas o pendientes de borrado no cambian de estado.
create function public.revisar_estado_creditos(p_company_id uuid, p_nueva_compra boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  s public.company_credit_settings;
  v_vivos integer;
  v_base integer;
  v_ultimo_lote uuid;
  v_pct numeric;
  v_nuevo text;
  v_avisos text[] := '{}';
  v_recarga jsonb := null;
begin
  perform public._credit_bloquear(p_company_id);
  select * into s from public.company_credit_settings where company_id = p_company_id for update;
  if not found then
    raise exception 'EMPRESA_SIN_AJUSTES' using errcode = 'CR007';
  end if;

  if p_nueva_compra then
    update public.company_credit_settings set aviso_20_enviado_en = null, aviso_5_enviado_en = null where company_id = p_company_id;
    s.aviso_20_enviado_en := null;
    s.aviso_5_enviado_en := null;
  end if;

  select coalesce(sum(creditos_restantes), 0)::integer into v_vivos
    from public.credit_lots where company_id = p_company_id and caduca_en > now();
  select id, creditos_iniciales into v_ultimo_lote, v_base
    from public.credit_lots
   where company_id = p_company_id and origen in ('pack', 'prueba', 'bono_mensual')
   order by creado_en desc, id desc limit 1;
  if v_base is null then
    select coalesce(sum(creditos_iniciales), 0)::integer into v_base
      from public.credit_lots where company_id = p_company_id and creditos_restantes > 0 and caduca_en > now();
  end if;
  v_pct := case when v_base > 0 then v_vivos::numeric / v_base else 0 end;

  if s.estado_oficina in ('pausada', 'pendiente_borrado') then
    return jsonb_build_object('estado', s.estado_oficina, 'anterior', s.estado_oficina, 'porcentaje', round(v_pct, 4),
                              'creditos', v_vivos, 'base', v_base, 'avisos', v_avisos, 'recarga_auto', null);
  end if;

  v_nuevo := case when v_vivos = 0 then 'sin_saldo' when v_pct <= 0.20 then 'saldo_bajo' else 'activa' end;

  -- Avisos del 5 % y del 20 %: una sola vez cada uno. Si se cruzan los dos a la vez, solo se notifica el del 5 %.
  if v_pct <= 0.05 and s.aviso_5_enviado_en is null then
    update public.company_credit_settings
       set aviso_5_enviado_en = now(), aviso_20_enviado_en = coalesce(aviso_20_enviado_en, now())
     where company_id = p_company_id;
    if v_vivos > 0 then
      insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
      values (p_company_id, 'saldo_bajo_5', 'Te queda menos del 5 % de tus créditos',
              format('Quedan %s créditos. Recarga para que tus agentes no se detengan.', v_vivos),
              jsonb_build_object('creditos', v_vivos, 'porcentaje', round(v_pct, 4)));
      v_avisos := array_append(v_avisos, 'saldo_bajo_5'::text);
    end if;
  elsif v_pct <= 0.20 and s.aviso_20_enviado_en is null then
    update public.company_credit_settings set aviso_20_enviado_en = now() where company_id = p_company_id;
    insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
    values (p_company_id, 'saldo_bajo_20', 'Te queda menos del 20 % de tus créditos',
            format('Quedan %s créditos. Conviene recargar pronto.', v_vivos),
            jsonb_build_object('creditos', v_vivos, 'porcentaje', round(v_pct, 4)));
    v_avisos := array_append(v_avisos, 'saldo_bajo_20'::text);
  end if;

  if v_nuevo = 'sin_saldo' and s.estado_oficina <> 'sin_saldo' then
    insert into public.notifications (company_id, tipo, titulo, cuerpo)
    values (p_company_id, 'sin_saldo', 'Te has quedado sin créditos',
            'Tu oficina pasa al modo mínimo hasta que recargues.');
    v_avisos := array_append(v_avisos, 'sin_saldo'::text);
  end if;

  if v_nuevo <> s.estado_oficina then
    update public.company_credit_settings set estado_oficina = v_nuevo where company_id = p_company_id;
  end if;

  if s.recarga_auto_activa and s.recarga_auto_pack_id is not null and s.recarga_auto_umbral is not null
     and v_vivos < s.recarga_auto_umbral then
    v_recarga := jsonb_build_object('pack_id', s.recarga_auto_pack_id, 'ultimo_lote_id', v_ultimo_lote);
  end if;

  return jsonb_build_object('estado', v_nuevo, 'anterior', s.estado_oficina, 'porcentaje', round(v_pct, 4),
                            'creditos', v_vivos, 'base', v_base, 'avisos', v_avisos, 'recarga_auto', v_recarga);
end;
$$;

revoke all on function public.creditos_consumidos_mes(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.revisar_estado_creditos(uuid, boolean) from public, anon, authenticated;
grant execute on function public.creditos_consumidos_mes(uuid, timestamptz) to service_role;
grant execute on function public.revisar_estado_creditos(uuid, boolean) to service_role;
