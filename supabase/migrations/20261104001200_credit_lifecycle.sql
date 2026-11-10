-- Fase 2 · Ciclo de vida de la oficina: caducidad, pausa, borrado programado, bonos y rutinas.
-- Las tareas periódicas (ver src/lib/creditos/tareasPeriodicas.ts) llaman a estas funciones con la fecha actual
-- INYECTADA (p_ahora), para poder probar cada transición sin esperar días reales.

-- 1) Más tipos de notificación ----------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check check (tipo in (
  'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica',
  'lote_por_caducar', 'oficina_pausada', 'borrado_programado', 'bono_renovado'
));

-- 2) Aviso de caducidad (una vez por lote) y renovación del bono ---------------------------------------------------
alter table public.credit_lots add column aviso_caducidad_en timestamptz;
alter table public.company_credit_settings add column bono_proxima_renovacion_en timestamptz;

-- Al activar un bono mensual, la primera renovación es dentro de un mes; al quitarlo, no hay renovación.
create function public.company_credit_settings_bono()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.bono_mensual_pack_id is null then
    new.bono_proxima_renovacion_en := null;
  elsif new.bono_proxima_renovacion_en is null then
    new.bono_proxima_renovacion_en := now() + interval '1 month';
  end if;
  return new;
end;
$$;
create trigger company_credit_settings_bono
  before insert or update of bono_mensual_pack_id on public.company_credit_settings
  for each row execute function public.company_credit_settings_bono();

-- 3) Rutinas programadas de los agentes ----------------------------------------------------------------------------
create table public.agent_routines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid not null,
  nombre text not null,
  -- Lo que se le pide al agente en cada ejecución.
  instruccion text not null,
  tipo_tarea text not null check (tipo_tarea in ('simple', 'estandar', 'experta')),
  frecuencia text not null check (frecuencia in ('cada_hora', 'diaria', 'laborables', 'semanal', 'mensual')),
  activa boolean not null default true,
  proxima_ejecucion_en timestamptz not null,
  ultima_ejecucion_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade
);
create index agent_routines_vencidas_idx on public.agent_routines (proxima_ejecucion_en) where activa;
create index agent_routines_company_idx on public.agent_routines (company_id);

alter table public.agent_routines enable row level security;
create policy agent_routines_select on public.agent_routines for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy agent_routines_write on public.agent_routines for all to authenticated
  using (company_id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'))
  with check (company_id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'));
revoke all on public.agent_routines from anon;
grant select, insert, update, delete on public.agent_routines to authenticated, service_role;

-- 4) Revisión del estado: una compra reactiva una oficina pausada o pendiente de borrado ----------------------------
-- (sustituye a la de la migración anterior; misma firma)
create or replace function public.revisar_estado_creditos(p_company_id uuid, p_nueva_compra boolean default false)
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
  v_reactivar boolean;
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

  -- Comprar créditos reactiva la oficina y cancela el borrado programado; reinicia la cuenta de inactividad.
  v_reactivar := p_nueva_compra and s.estado_oficina in ('pausada', 'pendiente_borrado');
  if s.estado_oficina in ('pausada', 'pendiente_borrado') and not v_reactivar then
    return jsonb_build_object('estado', s.estado_oficina, 'anterior', s.estado_oficina, 'porcentaje', round(v_pct, 4),
                              'creditos', v_vivos, 'base', v_base, 'avisos', v_avisos, 'recarga_auto', null);
  end if;
  if v_reactivar then
    update public.company_credit_settings
       set pausada_en = null, borrado_programado_en = null, ultima_actividad_en = now()
     where company_id = p_company_id;
  end if;

  v_nuevo := case when v_vivos = 0 then 'sin_saldo' when v_pct <= 0.20 then 'saldo_bajo' else 'activa' end;

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
                            'creditos', v_vivos, 'base', v_base, 'avisos', v_avisos, 'recarga_auto', v_recarga,
                            'reactivada', v_reactivar);
end;
$$;

-- 5) Caducidad de lotes con fecha inyectada -------------------------------------------------------------------------
-- Sustituye a caducar_lotes() (sin argumentos). Devuelve también las empresas afectadas para revisar su estado.
drop function public.caducar_lotes();
create function public.caducar_lotes(p_ahora timestamptz default now(), p_company_id uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  cand record;
  lot public.credit_lots;
  v_lotes integer := 0;
  v_creditos integer := 0;
  v_empresas uuid[] := '{}';
begin
  for cand in
    select id, company_id from public.credit_lots
     where creditos_restantes > 0 and caduca_en <= p_ahora and (p_company_id is null or company_id = p_company_id)
     order by company_id, caduca_en
  loop
    perform public._credit_bloquear(cand.company_id);
    select * into lot from public.credit_lots where id = cand.id and creditos_restantes > 0 and caduca_en <= p_ahora for update;
    if found then
      insert into public.credit_ledger (company_id, tipo, creditos, lot_id, concepto, metadatos)
      values (lot.company_id, 'caducidad', -lot.creditos_restantes, lot.id, 'caducidad_lote',
              jsonb_build_object('caduco_en', lot.caduca_en));
      update public.credit_lots set creditos_restantes = 0 where id = lot.id;
      v_lotes := v_lotes + 1;
      v_creditos := v_creditos + lot.creditos_restantes;
      if not (lot.company_id = any (v_empresas)) then v_empresas := array_append(v_empresas, lot.company_id); end if;
    end if;
  end loop;
  return jsonb_build_object('lotes', v_lotes, 'creditos', v_creditos, 'empresas', to_jsonb(v_empresas));
end;
$$;

-- Aviso: faltan ≤ p_dias para que caduque un lote con MÁS de p_min_creditos restantes. Una sola vez por lote.
create function public.avisar_lotes_por_caducar(p_ahora timestamptz, p_dias integer, p_min_creditos integer, p_company_id uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  with l as (
    update public.credit_lots
       set aviso_caducidad_en = p_ahora
     where creditos_restantes > p_min_creditos
       and caduca_en > p_ahora
       and caduca_en <= p_ahora + make_interval(days => p_dias)
       and aviso_caducidad_en is null
       and (p_company_id is null or company_id = p_company_id)
    returning id, company_id, creditos_restantes, caduca_en
  ), n as (
    insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
    select company_id, 'lote_por_caducar', 'Un lote de créditos caduca pronto',
           format('%s créditos caducan el %s. Úsalos antes de esa fecha.', creditos_restantes,
                  to_char(caduca_en at time zone 'Europe/Madrid', 'DD/MM/YYYY')),
           jsonb_build_object('lote_id', id, 'creditos', creditos_restantes, 'caduca_en', caduca_en)
      from l
    returning 1
  )
  select count(*)::integer into n from n;
  return n;
end;
$$;

-- 6) Transiciones de estado por el paso del tiempo ----------------------------------------------------------------------
--  · activa / saldo_bajo / sin_saldo con p_dias_inactividad días sin actividad → pausada (pausada_en).
--    (Un «sin_saldo» de 60 días es lo mismo que 60 días sin actividad: la última actividad fue el consumo que lo dejó a 0.)
--  · pausada desde hace p_dias_pausada días → pendiente_borrado, borrado a p_dias_gracia días vista, con aviso.
--  · pendiente_borrado con la fecha cumplida: SOLO se lista (borrado_vencido). El borrado de datos NO está implementado.
create function public.avanzar_estados_oficina(
  p_ahora timestamptz default now(), p_dias_inactividad integer default 60, p_dias_pausada integer default 90, p_dias_gracia integer default 7,
  p_company_id uuid default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pausadas uuid[];
  v_pendientes uuid[];
  v_vencidas uuid[];
begin
  with p as (
    update public.company_credit_settings
       set estado_oficina = 'pausada', pausada_en = p_ahora
     where estado_oficina in ('activa', 'saldo_bajo', 'sin_saldo')
       and ultima_actividad_en <= p_ahora - make_interval(days => p_dias_inactividad)
       and (p_company_id is null or company_id = p_company_id)
    returning company_id
  ), n as (
    insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
    select company_id, 'oficina_pausada', 'Tu oficina se ha pausado',
           format('Llevas %s días sin actividad. Tus agentes y rutinas están parados; compra créditos para reactivarla.', p_dias_inactividad),
           jsonb_build_object('pausada_en', p_ahora)
      from p
    returning company_id
  )
  select coalesce(array_agg(company_id), '{}') into v_pausadas from n;

  with p as (
    update public.company_credit_settings
       set estado_oficina = 'pendiente_borrado', borrado_programado_en = p_ahora + make_interval(days => p_dias_gracia)
     where estado_oficina = 'pausada' and pausada_en <= p_ahora - make_interval(days => p_dias_pausada)
       and (p_company_id is null or company_id = p_company_id)
    returning company_id, borrado_programado_en
  ), n as (
    insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
    select company_id, 'borrado_programado', 'Tus datos se borrarán pronto',
           format('Si no compras créditos antes del %s, se borrarán los datos de tu oficina.',
                  to_char(borrado_programado_en at time zone 'Europe/Madrid', 'DD/MM/YYYY')),
           jsonb_build_object('borrado_programado_en', borrado_programado_en)
      from p
    returning company_id
  )
  select coalesce(array_agg(company_id), '{}') into v_pendientes from n;

  select coalesce(array_agg(company_id), '{}') into v_vencidas
    from public.company_credit_settings where estado_oficina = 'pendiente_borrado' and borrado_programado_en <= p_ahora
       and (p_company_id is null or company_id = p_company_id);

  return jsonb_build_object('pausadas', to_jsonb(v_pausadas), 'pendientes_de_borrado', to_jsonb(v_pendientes),
                            'borrado_vencido', to_jsonb(v_vencidas));
end;
$$;

-- Solo el servicio las ejecuta.
do $$
declare
  f text;
begin
  foreach f in array array[
    'company_credit_settings_bono()',
    'revisar_estado_creditos(uuid, boolean)',
    'caducar_lotes(timestamptz, uuid)',
    'avisar_lotes_por_caducar(timestamptz, integer, integer, uuid)',
    'avanzar_estados_oficina(timestamptz, integer, integer, integer, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
