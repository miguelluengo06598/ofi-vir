-- Clientes en el panel de SAMGPLE (/admin/clientes): ficha interna, notas, datos fiscales, exportaciones, cambio de propietario
-- y las acciones de administración (créditos, pausa, suspensión, reactivación y borrado).
-- Reglas: todo es solo service_role (las páginas de /admin llaman desde el servidor tras comprobar rol y MFA) salvo lo que la
-- propia empresa debe ver (sus exportaciones y la confirmación de un cambio de propietario), que va por RLS de su empresa.
-- Ninguna función devuelve contenido de la empresa (contactos, correos, memoria, tareas): solo metadatos y agregados.

-- 0) Tablas de solo inserción que SÍ se vacían al borrar una empresa (agent_versions y cliente_notas): el DELETE solo se permite
-- dentro de admin_empresa_borrar (marca de transacción app.borrado_empresa con el id de esa empresa), nunca para el navegador.
create function public.solo_insercion_salvo_borrado_empresa()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_user not in ('authenticated', 'anon')
     and current_setting('app.borrado_empresa', true) = old.company_id::text then
    return old;
  end if;
  raise exception 'La tabla % es de solo inserción: % no está permitido (los cambios son filas nuevas)', tg_table_name, tg_op using errcode = '42501';
end $$;
drop trigger agent_versions_no_update_delete on public.agent_versions;
create trigger agent_versions_no_update_delete before update or delete on public.agent_versions
  for each row execute function public.solo_insercion_salvo_borrado_empresa();

-- 1) Estado de la empresa: suspensión con motivo y borrado ----------------------------------------------------------------------
-- 'borrada': la fila de la empresa se conserva como referencia del libro contable y de las facturas (credit_ledger y purchases
-- no se borran con ella); todo lo demás se ha eliminado con admin_empresa_borrar.
alter table public.companies drop constraint companies_estado_check;
alter table public.companies add constraint companies_estado_check check (estado in ('activa', 'suspendida', 'borrada'));
alter table public.companies
  add column suspendida_motivo text check (suspendida_motivo in ('impago', 'abuso', 'peticion_cliente')),
  add column suspendida_en timestamptz,
  add column borrada_en timestamptz,
  add constraint companies_suspension_coherente check (suspendida_motivo is null or estado = 'suspendida');

-- Pausa impuesta por SAMGPLE: usa el mismo interruptor que la empresa (agentes_pausados), pero la empresa no puede quitarla.
alter table public.company_credit_settings
  add column pausada_por_samgple uuid references auth.users (id) on delete set null,
  add column pausada_samgple_motivo text check (pausada_samgple_motivo in ('impago', 'abuso', 'peticion_cliente')),
  add constraint ccs_pausa_samgple_coherente check (pausada_por_samgple is null or agentes_pausados);

-- 2) Ficha interna del cliente (solo SAMGPLE) -------------------------------------------------------------------------------------
create table public.cliente_ficha (
  company_id uuid primary key references public.companies (id) on delete cascade,
  responsable uuid references auth.users (id) on delete set null,
  -- Catálogo en src/lib/admin/clientes/config.ts (SERVICIOS).
  servicios text[] not null default '{}'
    check (servicios <@ array['implantacion', 'formacion', 'soporte_prioritario', 'agente_a_medida', 'integraciones']::text[]),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);
create index cliente_ficha_responsable_idx on public.cliente_ficha (responsable);

-- Notas internas: solo inserción (una corrección es una nota nueva).
create table public.cliente_notas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  autor_id uuid not null references auth.users (id) on delete restrict,
  texto text not null check (char_length(btrim(texto)) between 1 and 4000),
  creado_en timestamptz not null default now()
);
create index cliente_notas_empresa_idx on public.cliente_notas (company_id, creado_en desc);
create trigger cliente_notas_solo_insercion before update or delete on public.cliente_notas
  for each row execute function public.solo_insercion_salvo_borrado_empresa();

-- 3) Datos fiscales (para las facturas de servicios). Se conservan al borrar la empresa: forman parte de sus facturas. ------------
create table public.empresa_datos_fiscales (
  company_id uuid primary key references public.companies (id) on delete restrict,
  razon_social text not null check (char_length(btrim(razon_social)) between 2 and 200),
  nif text not null check (nif ~ '^[A-Z0-9]{8,12}$'),
  direccion text not null check (char_length(btrim(direccion)) between 3 and 300),
  codigo_postal text not null check (codigo_postal ~ '^[0-9A-Z -]{3,10}$'),
  ciudad text not null check (char_length(btrim(ciudad)) between 1 and 120),
  provincia text check (char_length(provincia) <= 120),
  pais text not null default 'ES' check (pais ~ '^[A-Z]{2}$'),
  email_facturacion text not null check (char_length(email_facturacion) between 3 and 254 and email_facturacion like '%_@_%'),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);

-- 4) Exportaciones (portabilidad). SAMGPLE la lanza y ve su estado; el archivo SOLO lo descarga la empresa. --------------------
create table public.empresa_exportaciones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  solicitada_por uuid not null references auth.users (id) on delete restrict,
  motivo text not null check (char_length(btrim(motivo)) between 3 and 1000),
  estado text not null default 'procesando' check (estado in ('procesando', 'lista', 'error', 'caducada')),
  ruta_archivo text,
  tamano_bytes bigint check (tamano_bytes is null or tamano_bytes >= 0),
  error text check (char_length(error) <= 300),
  creado_en timestamptz not null default now(),
  terminada_en timestamptz,
  caduca_en timestamptz,
  descargada_en timestamptz,
  check ((estado = 'lista') = (ruta_archivo is not null))
);
create index empresa_exportaciones_empresa_idx on public.empresa_exportaciones (company_id, creado_en desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exportaciones', 'exportaciones', false, 524288000, array['application/json'])
on conflict (id) do nothing;

-- 5) Cambio de propietario pedido por SAMGPLE: lo confirma el propietario actual (en su oficina) o un admin_samgple. ------------
create table public.cambios_propietario (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  propietario_actual uuid not null references auth.users (id) on delete cascade,
  nuevo_propietario uuid not null references auth.users (id) on delete cascade,
  solicitado_por uuid not null references auth.users (id) on delete restrict,
  motivo text not null check (char_length(btrim(motivo)) between 3 and 1000),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'rechazado', 'cancelado', 'caducado')),
  resuelto_por uuid references auth.users (id) on delete set null,
  resuelto_via text check (resuelto_via in ('propietario', 'admin_samgple')),
  creado_en timestamptz not null default now(),
  caduca_en timestamptz not null default now() + interval '7 days',
  resuelto_en timestamptz,
  check (propietario_actual <> nuevo_propietario)
);
create unique index cambios_propietario_un_pendiente_idx on public.cambios_propietario (company_id) where estado = 'pendiente';

-- 6) Avisos nuevos a la empresa -------------------------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check check (tipo in (
  'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica', 'lote_por_caducar', 'oficina_pausada', 'borrado_programado',
  'bono_renovado', 'conexion_caducada', 'limite_mensajes_agente', 'tope_creditos_agente', 'traspaso_cortado', 'certificacion_estado',
  'certificacion_caducada', 'agente_sin_certificar', 'agente_suspendido', 'calidad_agente',
  'empresa_suspendida', 'empresa_reactivada', 'oficina_pausada_samgple', 'creditos_regalados', 'exportacion_lista', 'cambio_propietario'));

-- 7) RLS y permisos -------------------------------------------------------------------------------------------------------------
alter table public.cliente_ficha enable row level security;
alter table public.cliente_notas enable row level security;
alter table public.empresa_datos_fiscales enable row level security;
alter table public.empresa_exportaciones enable row level security;
alter table public.cambios_propietario enable row level security;
revoke all on public.cliente_ficha, public.cliente_notas, public.empresa_datos_fiscales, public.empresa_exportaciones,
  public.cambios_propietario from public, anon, authenticated;
grant select, insert, update, delete on public.cliente_ficha, public.cliente_notas, public.empresa_datos_fiscales,
  public.empresa_exportaciones, public.cambios_propietario to service_role;
-- La empresa ve sus exportaciones (sin la ruta interna del archivo) y los cambios de propietario pendientes (propietario/admin).
create policy empresa_exportaciones_select on public.empresa_exportaciones for select to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')));
grant select (id, company_id, estado, tamano_bytes, creado_en, terminada_en, caduca_en, descargada_en) on public.empresa_exportaciones to authenticated;
create policy cambios_propietario_select on public.cambios_propietario for select to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')));
grant select (id, company_id, propietario_actual, nuevo_propietario, motivo, estado, creado_en, caduca_en, resuelto_en) on public.cambios_propietario to authenticated;

-- 8) Listado de clientes: una fila por empresa (sin las de examen), solo metadatos y agregados -----------------------------------
create function public.admin_clientes_listado(p_ahora timestamptz default now())
returns table (
  id uuid, nombre text, sector text, estado text, suspendida_motivo text, creada_en timestamptz,
  propietario_id uuid, propietario_nombre text, propietario_email text,
  agentes_activos integer, agentes_suspendidos integer, consumo_mes integer, saldo integer,
  ultima_actividad timestamptz, estado_oficina text, oficina_pausada boolean, pausada_por_samgple boolean,
  en_implantacion boolean, responsable_id uuid, responsable_nombre text,
  valoraciones_negativas integer, valoraciones_total integer, recargas_fallidas integer
)
language sql stable set search_path = '' as $$
  select c.id, c.name, c.sector, c.estado, c.suspendida_motivo, c.created_at,
         pm.user_id, pu.full_name, pu.email,
         (select count(*)::integer from public.agents a where a.company_id = c.id and a.estado = 'activo'),
         (select count(*)::integer from public.agents a where a.company_id = c.id and a.estado = 'suspendido'),
         (select coalesce(-sum(l.creditos), 0)::integer from public.credit_ledger l
           where l.company_id = c.id and l.tipo = 'consumo'
             and l.creado_en >= date_trunc('month', p_ahora at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'),
         greatest(
           coalesce((select sum(lo.creditos_restantes) from public.credit_lots lo where lo.company_id = c.id and lo.caduca_en > p_ahora), 0)
           - coalesce((select sum(r.creditos) from public.credit_reservations r where r.company_id = c.id and r.estado = 'activa'), 0), 0)::integer,
         greatest(s.ultima_actividad_en, (select max(t.started_at) from public.tasks t where t.company_id = c.id and not coalesce(t.es_simulacion, false))),
         s.estado_oficina, coalesce(s.agentes_pausados, false), s.pausada_por_samgple is not null,
         exists (select 1 from public.implantaciones i where i.company_id = c.id and i.estado = 'en_curso'),
         f.responsable, coalesce(pr.nombre, ru.full_name),
         (select count(*)::integer from public.agent_feedback fb where fb.company_id = c.id and fb.value = -1 and fb.created_at >= p_ahora - interval '30 days'),
         (select count(*)::integer from public.agent_feedback fb where fb.company_id = c.id and fb.created_at >= p_ahora - interval '30 days'),
         (select count(*)::integer from public.internal_alerts ia where ia.company_id = c.id and ia.tipo = 'recarga_fallida' and ia.creado_en >= p_ahora - interval '30 days')
    from public.companies c
    left join public.company_credit_settings s on s.company_id = c.id
    left join public.company_members pm on pm.company_id = c.id and pm.rol = 'propietario' and pm.estado <> 'desactivado'
    left join public.users pu on pu.id = pm.user_id
    left join public.cliente_ficha f on f.company_id = c.id
    left join public.platform_roles pr on pr.user_id = f.responsable
    left join public.users ru on ru.id = f.responsable
   where not c.es_examen
   order by c.name
$$;

-- 9) Créditos: regalo o ajuste (con signo), atómico y nunca por debajo de cero ---------------------------------------------------
-- Regalo: lote nuevo de origen 'regalo'. Ajuste positivo: lote de origen 'ajuste'. Ajuste negativo: descuenta de los lotes que
-- caducan antes con movimientos 'ajuste' en el libro (nunca se edita un movimiento anterior). Idempotente por clave.
create function public.admin_ajustar_creditos(
  p_company_id uuid, p_tipo text, p_creditos integer, p_dias_caducidad integer, p_actor uuid, p_motivo text, p_clave text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_res jsonb;
  v_disponible integer;
  v_falta integer;
  v_tomar integer;
  v_op uuid := gen_random_uuid();
  v_primera boolean := true;
  v_meta jsonb := jsonb_build_object('admin', true, 'actor', p_actor, 'motivo', left(p_motivo, 500));
  lot public.credit_lots;
begin
  if p_tipo not in ('regalo', 'ajuste') then raise exception 'TIPO_INVALIDO' using errcode = '22023'; end if;
  if p_creditos is null or p_creditos = 0 or abs(p_creditos) > 10000000 then raise exception 'CREDITOS_INVALIDOS' using errcode = '22023'; end if;
  if p_tipo = 'regalo' and p_creditos < 0 then raise exception 'REGALO_NEGATIVO: un regalo siempre suma' using errcode = '22023'; end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then raise exception 'MOTIVO_OBLIGATORIO' using errcode = '22023'; end if;
  if not exists (select 1 from public.companies where id = p_company_id and estado <> 'borrada' and not es_examen) then
    raise exception 'EMPRESA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;

  if p_creditos > 0 then
    -- Quién y por qué quedan en admin_audit_log (el servidor lo anota con el resultado); referencia_pago marca el origen interno.
    v_res := public.anadir_lote(p_company_id, p_tipo, null, p_creditos, coalesce(p_dias_caducidad, 365), 'samgple:' || p_actor::text, p_clave);
  else
    perform public._credit_bloquear(p_company_id);
    v_res := public._credit_resultado_previo(p_company_id, p_clave);
    if v_res is not null then return v_res || jsonb_build_object('duplicado', true); end if;
    v_disponible := public._credit_disponible(p_company_id);
    if v_disponible < -p_creditos then
      raise exception 'SALDO_INSUFICIENTE: se quieren retirar % créditos y hay % disponibles', -p_creditos, v_disponible using errcode = 'CR001';
    end if;
    v_falta := -p_creditos;
    for lot in
      select * from public.credit_lots
       where company_id = p_company_id and creditos_restantes > 0 and caduca_en > now()
       order by caduca_en, creado_en, id
    loop
      exit when v_falta = 0;
      v_tomar := least(lot.creditos_restantes, v_falta);
      update public.credit_lots set creditos_restantes = creditos_restantes - v_tomar where id = lot.id;
      insert into public.credit_ledger (company_id, tipo, creditos, lot_id, concepto, clave_idempotencia, metadatos, operacion_id, saldo_resultante)
      values (p_company_id, 'ajuste', -v_tomar, lot.id, 'ajuste_admin', case when v_primera then p_clave end, v_meta, v_op, v_disponible + p_creditos);
      v_primera := false;
      v_falta := v_falta - v_tomar;
    end loop;
    v_res := jsonb_build_object('operacion_id', v_op, 'creditos', p_creditos, 'saldo', v_disponible + p_creditos, 'duplicado', false);
  end if;

  perform public.revisar_estado_creditos(p_company_id, false);
  if p_creditos > 0 and not coalesce((v_res ->> 'duplicado')::boolean, false) then
    insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
    values (p_company_id, 'creditos_regalados',
            case when p_tipo = 'regalo' then format('SAMGPLE te ha regalado %s créditos', p_creditos) else format('Se han añadido %s créditos a tu saldo', p_creditos) end,
            format('Caducan dentro de %s días.', coalesce(p_dias_caducidad, 365)), jsonb_build_object('creditos', p_creditos));
  end if;
  return v_res;
end $$;

-- 10) Pausar, suspender y reactivar ----------------------------------------------------------------------------------------------
-- Pausar: ninguna tarea nueva empieza (el mismo interruptor que la empresa), y la empresa no puede reanudar sola.
-- Suspender: además nadie de la empresa entra (es_miembro exige 'activa'); los agentes quedan pausados también.
-- Reactivar: deshace ambas cosas y, si la oficina estaba pausada por inactividad o pendiente de borrado, la recupera.
create function public.admin_empresa_estado(p_company_id uuid, p_accion text, p_motivo_tipo text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.companies;
  s public.company_credit_settings;
  v_titulo text;
  v_cuerpo text;
  v_motivo_texto text := case p_motivo_tipo when 'impago' then 'un impago pendiente' when 'abuso' then 'un uso indebido de la plataforma'
                                            when 'peticion_cliente' then 'tu petición' else null end;
begin
  select * into c from public.companies where id = p_company_id for update;
  if not found or c.es_examen or c.estado = 'borrada' then raise exception 'EMPRESA_NO_ENCONTRADA' using errcode = 'P0002'; end if;
  select * into s from public.company_credit_settings where company_id = p_company_id for update;

  if p_accion in ('pausar', 'suspender') then
    if v_motivo_texto is null then raise exception 'MOTIVO_INVALIDO' using errcode = '22023'; end if;
    update public.company_credit_settings
       set agentes_pausados = true, agentes_pausados_en = coalesce(agentes_pausados_en, now()), agentes_pausados_por = null,
           pausada_por_samgple = p_actor, pausada_samgple_motivo = p_motivo_tipo
     where company_id = p_company_id;
    if p_accion = 'suspender' then
      update public.companies set estado = 'suspendida', suspendida_motivo = p_motivo_tipo, suspendida_en = now() where id = p_company_id;
      v_titulo := 'Tu empresa está suspendida';
      v_cuerpo := format('SAMGPLE ha suspendido el acceso a tu oficina por %s. Tus agentes no trabajan y nadie de tu equipo puede entrar hasta que se resuelva. Escríbenos para reactivarla.', v_motivo_texto);
      insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
      values (p_company_id, 'empresa_suspendida', v_titulo, v_cuerpo, jsonb_build_object('motivo', p_motivo_tipo));
    else
      if c.estado = 'suspendida' then raise exception 'YA_SUSPENDIDA: la empresa ya está suspendida' using errcode = '22023'; end if;
      v_titulo := 'SAMGPLE ha pausado tu oficina';
      v_cuerpo := format('Tus agentes no empezarán tareas nuevas por %s. Lo que llegue se guarda. Escríbenos para reanudarla.', v_motivo_texto);
      insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
      values (p_company_id, 'oficina_pausada_samgple', v_titulo, v_cuerpo, jsonb_build_object('motivo', p_motivo_tipo));
    end if;
  elsif p_accion = 'reactivar' then
    if c.estado = 'activa' and s.pausada_por_samgple is null and s.estado_oficina not in ('pausada', 'pendiente_borrado') then
      raise exception 'NADA_QUE_REACTIVAR: la empresa ya está activa' using errcode = '22023';
    end if;
    update public.companies set estado = 'activa', suspendida_motivo = null, suspendida_en = null where id = p_company_id;
    if s.pausada_por_samgple is not null then
      update public.company_credit_settings
         set agentes_pausados = false, agentes_pausados_en = null, agentes_pausados_por = null, pausada_por_samgple = null, pausada_samgple_motivo = null
       where company_id = p_company_id;
    end if;
    if s.estado_oficina in ('pausada', 'pendiente_borrado') then
      update public.company_credit_settings
         set estado_oficina = 'activa', pausada_en = null, borrado_programado_en = null, ultima_actividad_en = now()
       where company_id = p_company_id;
      perform public.revisar_estado_creditos(p_company_id, false);
    end if;
    insert into public.notifications (company_id, tipo, titulo, cuerpo)
    values (p_company_id, 'empresa_reactivada', 'Tu oficina vuelve a estar activa', 'SAMGPLE ha reactivado tu oficina. Tus agentes pueden volver a trabajar.');
  else
    raise exception 'ACCION_INVALIDA' using errcode = '22023';
  end if;

  select * into c from public.companies where id = p_company_id;
  select * into s from public.company_credit_settings where company_id = p_company_id;
  return jsonb_build_object('estado', c.estado, 'suspendida_motivo', c.suspendida_motivo, 'agentes_pausados', s.agentes_pausados,
                            'pausada_por_samgple', s.pausada_por_samgple is not null, 'estado_oficina', s.estado_oficina);
end $$;

-- 11) Propiedad e invitaciones desde SAMGPLE --------------------------------------------------------------------------------------
-- Aplica un cambio de propietario ya confirmado (por el propietario actual o por un admin_samgple). El anterior pasa a admin.
create function public.admin_cambio_propietario_resolver(p_cambio_id uuid, p_actor uuid, p_via text, p_aceptar boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.cambios_propietario;
begin
  select * into v from public.cambios_propietario where id = p_cambio_id for update;
  if not found or v.estado <> 'pendiente' then raise exception 'CAMBIO_NO_PENDIENTE' using errcode = '22023'; end if;
  if v.caduca_en < now() then
    update public.cambios_propietario set estado = 'caducado', resuelto_en = now() where id = v.id;
    return 'caducado';
  end if;
  if p_via = 'propietario' then
    if not exists (select 1 from public.company_members where company_id = v.company_id and user_id = p_actor and rol = 'propietario' and estado = 'activo') then
      raise exception 'SIN_PERMISO: solo el propietario actual confirma' using errcode = '42501';
    end if;
  elsif p_via = 'admin_samgple' then
    if not exists (select 1 from public.platform_roles where user_id = p_actor and activo and 'admin_samgple' = any (roles)) then
      raise exception 'SIN_PERMISO: solo admin_samgple confirma desde SAMGPLE' using errcode = '42501';
    end if;
  else
    raise exception 'VIA_INVALIDA' using errcode = '22023';
  end if;
  if not p_aceptar then
    update public.cambios_propietario set estado = 'rechazado', resuelto_por = p_actor, resuelto_via = p_via, resuelto_en = now() where id = v.id;
    return 'rechazado';
  end if;
  if not exists (select 1 from public.company_members where company_id = v.company_id and user_id = v.nuevo_propietario and estado = 'activo') then
    raise exception 'NUEVO_NO_ACTIVO: el nuevo propietario debe ser un miembro activo' using errcode = '22023';
  end if;
  if not exists (select 1 from public.company_members where company_id = v.company_id and user_id = v.propietario_actual and rol = 'propietario') then
    raise exception 'PROPIETARIO_CAMBIADO: el propietario ya no es el mismo; pide el cambio de nuevo' using errcode = '40001';
  end if;
  update public.company_members set rol = 'admin' where company_id = v.company_id and user_id = v.propietario_actual;
  update public.company_members set rol = 'propietario' where company_id = v.company_id and user_id = v.nuevo_propietario;
  update public.cambios_propietario set estado = 'confirmado', resuelto_por = p_actor, resuelto_via = p_via, resuelto_en = now() where id = v.id;
  return 'confirmado';
end $$;

-- Reenviar una invitación pendiente o caducada: revoca la anterior y crea otra con el mismo correo y rol (token nuevo).
create function public.admin_invitacion_reenviar(p_invitacion_id uuid, p_actor uuid, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.company_invitations;
  v_id uuid;
begin
  select * into v from public.company_invitations where id = p_invitacion_id for update;
  if not found or v.aceptada_en is not null then raise exception 'INVITACION_NO_REENVIABLE' using errcode = '22023'; end if;
  if not exists (select 1 from public.companies where id = v.company_id and estado = 'activa') then
    raise exception 'EMPRESA_NO_ACTIVA' using errcode = '22023';
  end if;
  update public.company_invitations set revocada_en = now()
   where company_id = v.company_id and email = v.email and aceptada_en is null and revocada_en is null;
  insert into public.company_invitations (company_id, email, rol, token_hash, invitado_por)
  values (v.company_id, v.email, v.rol, p_token_hash, p_actor) returning id into v_id;
  return v_id;
end $$;

-- 12) Borrar la empresa ----------------------------------------------------------------------------------------------------------
-- Borra TODOS los datos de la empresa y conserva solo: la fila de companies (estado 'borrada', como referencia), los lotes y el
-- libro de créditos (credit_lots, credit_ledger), las compras (purchases) y los datos fiscales de sus facturas, más el registro de
-- auditoría de SAMGPLE. Los secretos OAuth se borran del Vault. Los archivos de Storage y las cuentas de Auth que se quedan sin
-- empresa los borra el servidor (src/lib/admin/clientes/borrar.ts) con la lista que devuelve esta función.
create function public.admin_empresa_borrar(p_company_id uuid, p_nombre_confirmacion text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.companies;
  v_conservar text[] := array['credit_ledger', 'credit_lots', 'purchases', 'empresa_datos_fiscales', 'admin_audit_log'];
  -- Tablas de SAMGPLE que apuntan a la empresa sin ser datos suyos: se desvinculan (company_id = null), no se borran.
  v_desvincular text[] := array['solicitudes_acceso'];
  v_tablas text[];
  v_pendientes text[];
  v_siguiente text[];
  v_t text;
  v_n bigint;
  v_filas jsonb := '{}'::jsonb;
  v_miembros uuid[];
  v_ultimo_error text;
begin
  if not exists (select 1 from public.platform_roles where user_id = p_actor and activo and 'admin_samgple' = any (roles)) then
    raise exception 'SIN_PERMISO: solo admin_samgple borra empresas' using errcode = '42501';
  end if;
  select * into c from public.companies where id = p_company_id for update;
  if not found or c.es_examen then raise exception 'EMPRESA_NO_ENCONTRADA' using errcode = 'P0002'; end if;
  if c.estado = 'borrada' then raise exception 'YA_BORRADA' using errcode = '22023'; end if;
  if p_nombre_confirmacion is distinct from c.name then
    raise exception 'NOMBRE_NO_COINCIDE: escribe el nombre exacto de la empresa' using errcode = '22023';
  end if;

  -- Ninguna tarea nueva mientras se borra (y nadie entra: deja de estar 'activa').
  update public.companies set estado = 'borrada', borrada_en = now(), suspendida_motivo = null, suspendida_en = null where id = p_company_id;
  perform set_config('app.borrado_empresa', p_company_id::text, true);

  select coalesce(array_agg(distinct m.user_id), '{}') into v_miembros from public.company_members m where m.company_id = p_company_id;

  -- Secretos OAuth en el Vault.
  delete from vault.secrets where id in (select cc.token_ref from public.company_connections cc where cc.company_id = p_company_id and cc.token_ref is not null);

  foreach v_t in array v_desvincular loop
    execute format('update public.%I set company_id = null where company_id = $1', v_t) using p_company_id;
  end loop;

  select array_agg(c2.table_name::text order by c2.table_name) into v_tablas
    from information_schema.columns c2 join information_schema.tables t2 using (table_schema, table_name)
   where c2.table_schema = 'public' and c2.column_name = 'company_id' and t2.table_type = 'BASE TABLE'
     and c2.table_name::text <> all (v_conservar) and c2.table_name::text <> all (v_desvincular);

  -- Las claves foráneas entre tablas obligan a un orden: se repite la pasada hasta que todas quedan vacías.
  v_pendientes := v_tablas;
  for i in 1..30 loop
    exit when cardinality(v_pendientes) = 0;
    v_siguiente := '{}';
    foreach v_t in array v_pendientes loop
      begin
        execute format('delete from public.%I where company_id = $1', v_t) using p_company_id;
        get diagnostics v_n = row_count;
        v_filas := v_filas || jsonb_build_object(v_t, coalesce((v_filas ->> v_t)::bigint, 0) + v_n);
      exception when foreign_key_violation then
        v_siguiente := v_siguiente || v_t;
        v_ultimo_error := sqlerrm;
      end;
    end loop;
    if cardinality(v_siguiente) = cardinality(v_pendientes) then
      raise exception 'BORRADO_BLOQUEADO: no se pudieron borrar % (%)', array_to_string(v_siguiente, ', '), v_ultimo_error using errcode = '23503';
    end if;
    v_pendientes := v_siguiente;
  end loop;
  if cardinality(v_pendientes) > 0 then raise exception 'BORRADO_INCOMPLETO: %', array_to_string(v_pendientes, ', ') using errcode = '23503'; end if;

  -- Ninguna reserva viva ni lote utilizable: el saldo deja de existir (los lotes quedan como constancia contable).
  return jsonb_build_object('filas', v_filas, 'miembros', to_jsonb(v_miembros), 'nombre', c.name);
end $$;

-- Personas que se han quedado sin empresa ni rol de plataforma (para borrar su cuenta tras borrar la empresa).
create function public.admin_personas_huerfanas(p_user_ids uuid[])
returns setof uuid language sql stable security definer set search_path = '' as $$
  select u from unnest(p_user_ids) u
   where not exists (select 1 from public.company_members m where m.user_id = u)
     and not exists (select 1 from public.platform_roles p where p.user_id = u)
$$;

revoke all on function public.admin_clientes_listado(timestamptz), public.admin_ajustar_creditos(uuid, text, integer, integer, uuid, text, text),
  public.admin_empresa_estado(uuid, text, text, uuid), public.admin_cambio_propietario_resolver(uuid, uuid, text, boolean),
  public.admin_invitacion_reenviar(uuid, uuid, text), public.admin_empresa_borrar(uuid, text, uuid), public.admin_personas_huerfanas(uuid[]),
  public.solo_insercion_salvo_borrado_empresa() from public, anon, authenticated;
grant execute on function public.admin_clientes_listado(timestamptz), public.admin_ajustar_creditos(uuid, text, integer, integer, uuid, text, text),
  public.admin_empresa_estado(uuid, text, text, uuid), public.admin_cambio_propietario_resolver(uuid, uuid, text, boolean),
  public.admin_invitacion_reenviar(uuid, uuid, text), public.admin_empresa_borrar(uuid, text, uuid), public.admin_personas_huerfanas(uuid[]) to service_role;

comment on table public.cliente_ficha is 'Ficha interna de SAMGPLE por cliente (responsable y servicios). Nunca la ve la empresa.';
comment on table public.cliente_notas is 'Notas internas de SAMGPLE sobre un cliente. Solo inserción; nunca las ve la empresa.';
comment on table public.empresa_exportaciones is 'Exportaciones de portabilidad: SAMGPLE ve el estado, el archivo solo lo descarga la empresa.';
