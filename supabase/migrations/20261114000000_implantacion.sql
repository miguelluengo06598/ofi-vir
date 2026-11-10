-- Implantación (puesta en marcha) de cada cliente:
--  · Plantillas editables por SAMGPLE (onboarding_templates + onboarding_template_tareas): tareas para SAMGPLE o para el cliente,
--    obligatorias u opcionales, con fecha objetivo (días desde el alta), dependencias y, si se puede, comprobación automática.
--  · Las tareas de cada empresa (implantacion_tareas, de 20261112000000) se generan desde la plantilla: una por empresa, una por
--    agente («Configurar a {agente}») o una por integración que necesitan sus agentes («Conectar {integracion}»).
--  · Lo que se puede comprobar solo (invitación aceptada, datos fiscales, conexión hecha, conocimiento listo, agente probado,
--    enviado a certificación, certificado, activo) se marca automáticamente con disparadores.
--  · Con todas las obligatorias hechas y al menos un agente activo, la implantación se completa: la empresa pasa de
--    'en_implantacion' a 'activa' y se avisa al cliente (notifications) y a su responsable de SAMGPLE (internal_alerts).
-- 'en_implantacion' es un estado OPERATIVO: la empresa entra en su oficina y sus agentes certificados trabajan, igual que 'activa'.

-- 1) Estado de la empresa ----------------------------------------------------------------------------------------------------------
alter table public.companies drop constraint companies_estado_check;
alter table public.companies add constraint companies_estado_check check (estado in ('en_implantacion', 'activa', 'suspendida', 'borrada'));

create function public.empresa_operativa(p_estado text)
returns boolean language sql immutable set search_path = '' as $$ select p_estado in ('activa', 'en_implantacion') $$;

create or replace function public.es_miembro(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m join public.companies c on c.id = m.company_id
     where m.company_id = p_company_id and m.user_id = (select auth.uid()) and m.estado = 'activo' and public.empresa_operativa(c.estado))
$$;
create or replace function public.tiene_rol(p_company_id uuid, p_roles public.empresa_rol[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m join public.companies c on c.id = m.company_id
     where m.company_id = p_company_id and m.user_id = (select auth.uid()) and m.estado = 'activo' and public.empresa_operativa(c.estado) and m.rol = any (p_roles))
$$;
create or replace function public.puede_aprobar(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m join public.companies c on c.id = m.company_id
     where m.company_id = p_company_id and m.user_id = (select auth.uid()) and m.estado = 'activo' and public.empresa_operativa(c.estado)
       and (m.rol in ('propietario', 'admin') or m.puede_aprobar))
$$;

-- Reenviar invitación y reactivar: valen también para una empresa en implantación (y reactivar la devuelve a su estado previo).
create or replace function public.admin_invitacion_reenviar(p_invitacion_id uuid, p_actor uuid, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.company_invitations;
  v_id uuid;
begin
  select * into v from public.company_invitations where id = p_invitacion_id for update;
  if not found or v.aceptada_en is not null then raise exception 'INVITACION_NO_REENVIABLE' using errcode = '22023'; end if;
  if not exists (select 1 from public.companies where id = v.company_id and public.empresa_operativa(estado)) then
    raise exception 'EMPRESA_NO_ACTIVA' using errcode = '22023';
  end if;
  if v.propietario and exists (select 1 from public.company_members where company_id = v.company_id and rol = 'propietario' and estado <> 'desactivado') then
    raise exception 'YA_HAY_PROPIETARIO: la empresa ya tiene propietario; invita como administrador' using errcode = '22023';
  end if;
  update public.company_invitations set revocada_en = now()
   where company_id = v.company_id and email = v.email and aceptada_en is null and revocada_en is null;
  insert into public.company_invitations (company_id, email, rol, propietario, token_hash, invitado_por)
  values (v.company_id, v.email, v.rol, v.propietario, p_token_hash, p_actor) returning id into v_id;
  return v_id;
end $$;

-- Reactivar devuelve a la empresa a «en implantación» si la tiene en curso (y no exige que estuviera «activa»).
create or replace function public.admin_empresa_estado(p_company_id uuid, p_accion text, p_motivo_tipo text, p_actor uuid)
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
    if public.empresa_operativa(c.estado) and s.pausada_por_samgple is null and s.estado_oficina not in ('pausada', 'pendiente_borrado') then
      raise exception 'NADA_QUE_REACTIVAR: la empresa ya está activa' using errcode = '22023';
    end if;
    -- Vuelve a su estado operativo: en implantación si la tiene en curso; si no, activa.
    update public.companies
       set estado = case when exists (select 1 from public.implantaciones x where x.company_id = p_company_id and x.estado = 'en_curso') then 'en_implantacion' else 'activa' end,
           suspendida_motivo = null, suspendida_en = null
     where id = p_company_id;
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

-- 2) Plantillas de implantación -----------------------------------------------------------------------------------------------------
create table public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (char_length(btrim(nombre)) between 2 and 120),
  descripcion text check (char_length(descripcion) <= 1000),
  por_defecto boolean not null default false,
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null,
  check (not por_defecto or activa)
);
create unique index onboarding_templates_una_por_defecto on public.onboarding_templates (por_defecto) where por_defecto;

-- Catálogos (también en src/lib/admin/implantacion/config.ts):
--  comprobacion: cómo se marca sola. accion: botón directo que ve el cliente en «Puesta en marcha».
create table public.onboarding_template_tareas (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.onboarding_templates (id) on delete cascade,
  clave text not null check (clave ~ '^[a-z0-9_]{2,40}$'),
  titulo text not null check (char_length(btrim(titulo)) between 2 and 200),
  para text not null check (para in ('samgple', 'cliente')),
  ambito text not null default 'empresa' check (ambito in ('empresa', 'agente', 'integracion')),
  proveedor text check (proveedor ~ '^[a-z0-9_]{2,40}$'),
  obligatoria boolean not null default true,
  dias_objetivo integer not null default 7 check (dias_objetivo between 0 and 365),
  ayuda text check (char_length(ayuda) <= 300),
  comprobacion text check (comprobacion in ('invitacion_aceptada', 'datos_fiscales', 'conexion', 'conocimiento',
                                            'agente_probado', 'agente_enviado', 'agente_certificado', 'agente_activo')),
  accion text check (accion in ('aceptar_invitacion', 'datos_fiscales', 'conectar', 'conocimiento', 'aprobar_agente')),
  depende_de text[] not null default '{}',
  orden integer not null default 0,
  unique (template_id, clave),
  check (proveedor is null or ambito = 'empresa'),
  check (comprobacion is distinct from 'conexion' or ambito = 'integracion' or proveedor is not null),
  check (comprobacion not in ('agente_probado', 'agente_enviado', 'agente_certificado', 'agente_activo') or comprobacion is null or ambito = 'agente'),
  check (accion is distinct from 'aprobar_agente' or (ambito = 'agente' and para = 'cliente')),
  check (not (clave = any (depende_de)))
);

-- 3) Tareas de cada implantación: columnas nuevas (las de 20261112000000 y 20261113100000 no cambian de significado) ---------------
alter table public.implantaciones
  add column plantilla_id uuid references public.onboarding_templates (id) on delete set null,
  add column completada_en timestamptz;

alter table public.implantacion_tareas
  add column clave text,
  add column plantilla_tarea_id uuid references public.onboarding_template_tareas (id) on delete set null,
  add column agent_id uuid references public.agents (id) on delete cascade,
  add column proveedor text,
  add column obligatoria boolean not null default true,
  add column estado text not null default 'pendiente',
  add column responsable uuid references auth.users (id) on delete set null,
  add column comprobacion text,
  add column accion text,
  add column depende_de uuid[] not null default '{}',
  add column hecha_por uuid references auth.users (id) on delete set null,
  add column marcada_auto boolean not null default false,
  add column creado_en timestamptz not null default now();
update public.implantacion_tareas set estado = 'hecha' where hecha_en is not null;
alter table public.implantacion_tareas
  add constraint implantacion_tareas_estado_check check (estado in ('pendiente', 'en_curso', 'hecha', 'descartada')),
  add constraint implantacion_tareas_hecha_coherente check ((estado = 'hecha') = (hecha_en is not null));
-- Generar dos veces no duplica: una tarea por clave, agente e integración.
create unique index implantacion_tareas_generada_uq on public.implantacion_tareas
  (implantacion_id, clave, coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(proveedor, ''))
  where clave is not null;

-- 4) Avisos ---------------------------------------------------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check check (tipo in (
  'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica', 'lote_por_caducar', 'oficina_pausada', 'borrado_programado',
  'bono_renovado', 'conexion_caducada', 'limite_mensajes_agente', 'tope_creditos_agente', 'traspaso_cortado', 'certificacion_estado',
  'certificacion_caducada', 'agente_sin_certificar', 'agente_suspendido', 'calidad_agente',
  'empresa_suspendida', 'empresa_reactivada', 'oficina_pausada_samgple', 'creditos_regalados', 'exportacion_lista', 'cambio_propietario',
  'implantacion_completada'));
alter table public.internal_alerts drop constraint internal_alerts_tipo_check;
alter table public.internal_alerts add constraint internal_alerts_tipo_check check (tipo in (
  'margen_superado', 'limite_pasos', 'recarga_fallida', 'nueva_solicitud', 'certificacion_atrasada', 'error_sistema', 'implantacion_completada'));

-- 5) Motor de la implantación --------------------------------------------------------------------------------------------------------
-- Nombre legible de una integración para los títulos (el registro completo está en src/lib/integraciones/proveedores.ts).
create function public._nombre_integracion(p text)
returns text language sql immutable set search_path = '' as $$
  select case p when 'whatsapp' then 'WhatsApp' when 'hubspot' then 'el CRM (HubSpot)' when 'meta_ads' then 'Meta Lead Ads'
                when 'google_calendar' then 'Google Calendar' else p end
$$;

-- ¿Se cumple ya la comprobación automática de esta tarea?
create function public._implantacion_cumple(p_company_id uuid, p_comprobacion text, p_agent_id uuid, p_proveedor text)
returns boolean language sql stable set search_path = '' as $$
  select case p_comprobacion
    when 'invitacion_aceptada' then exists (select 1 from public.company_members m where m.company_id = p_company_id and m.rol = 'propietario' and m.estado = 'activo')
    when 'datos_fiscales' then exists (select 1 from public.empresa_datos_fiscales f where f.company_id = p_company_id)
    when 'conexion' then exists (select 1 from public.company_connections cc where cc.company_id = p_company_id and cc.proveedor = p_proveedor and cc.estado = 'conectado')
    when 'conocimiento' then exists (select 1 from public.agent_knowledge k where k.company_id = p_company_id and k.estado = 'listo')
    when 'agente_probado' then exists (select 1 from public.agents a where a.id = p_agent_id and a.estado <> 'borrador')
    when 'agente_enviado' then exists (select 1 from public.agents a where a.id = p_agent_id and a.estado in ('en_certificacion', 'certificado', 'activo', 'pausado'))
                            or exists (select 1 from public.certification_requests r where r.agent_id = p_agent_id)
    when 'agente_certificado' then exists (select 1 from public.agents a where a.id = p_agent_id and a.version_certificada is not null and a.estado in ('certificado', 'activo', 'pausado'))
    when 'agente_activo' then exists (select 1 from public.agents a where a.id = p_agent_id and a.estado = 'activo')
    else false end
$$;

-- Genera (sin duplicar) las tareas de la plantilla para los agentes e integraciones que la empresa tiene AHORA y recalcula las
-- dependencias de las que no están hechas. Se puede llamar las veces que haga falta (agentes nuevos → tareas nuevas).
create function public._implantacion_generar(p_impl_id uuid)
returns integer language plpgsql set search_path = '' as $$
declare
  i public.implantaciones;
  v_n integer;
begin
  select * into i from public.implantaciones where id = p_impl_id;
  if i.plantilla_id is null then return 0; end if;

  with agentes as (
    select a.id, a.name, a.template_id from public.agents a where a.company_id = i.company_id and a.estado <> 'archivado'
  ), integraciones as (
    select distinct x as proveedor from agentes a join public.agent_templates t on t.id = a.template_id, jsonb_array_elements_text(t.integraciones_requeridas) x
     where x <> 'demo'
  ), filas as (
    select t.id as tid, t.clave, t.titulo, t.para, t.obligatoria, t.dias_objetivo, t.ayuda, t.comprobacion, t.accion, t.orden, null::uuid as agent_id, t.proveedor
      from public.onboarding_template_tareas t where t.template_id = i.plantilla_id and t.ambito = 'empresa'
    union all
    select t.id, t.clave, replace(t.titulo, '{agente}', a.name), t.para, t.obligatoria, t.dias_objetivo, t.ayuda, t.comprobacion, t.accion, t.orden, a.id, null
      from public.onboarding_template_tareas t cross join agentes a where t.template_id = i.plantilla_id and t.ambito = 'agente'
    union all
    select t.id, t.clave, replace(t.titulo, '{integracion}', public._nombre_integracion(g.proveedor)), t.para, t.obligatoria, t.dias_objetivo, t.ayuda, t.comprobacion, t.accion, t.orden, null, g.proveedor
      from public.onboarding_template_tareas t cross join integraciones g where t.template_id = i.plantilla_id and t.ambito = 'integracion'
  )
  insert into public.implantacion_tareas (implantacion_id, clave, plantilla_tarea_id, titulo, para, obligatoria, vence_en, ayuda, comprobacion, accion, orden, agent_id, proveedor, responsable)
  select p_impl_id, f.clave, f.tid, left(f.titulo, 200), f.para, f.obligatoria, i.inicio + f.dias_objetivo, f.ayuda, f.comprobacion, f.accion, f.orden, f.agent_id, f.proveedor,
         case when f.para = 'samgple' then i.responsable end
    from filas f
  on conflict (implantacion_id, clave, coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(proveedor, '')) where clave is not null do nothing;
  get diagnostics v_n = row_count;

  -- Dependencias: por clave de la plantilla. Si las dos tareas son de agente, la del MISMO agente; si la que depende es de agente
  -- y la previa es de integración, solo las integraciones que necesita ese agente; en el resto, todas las de esa clave.
  update public.implantacion_tareas x
     set depende_de = coalesce((
       select array_agg(distinct d.id)
         from public.onboarding_template_tareas tx
         join public.onboarding_template_tareas td on td.template_id = tx.template_id and td.clave = any (tx.depende_de)
         join public.implantacion_tareas d on d.implantacion_id = x.implantacion_id and d.clave = td.clave
        where tx.id = x.plantilla_tarea_id
          and (td.ambito <> 'agente' or x.agent_id is null or d.agent_id = x.agent_id)
          and (td.ambito <> 'integracion' or x.agent_id is null or d.proveedor in (
                select jsonb_array_elements_text(t.integraciones_requeridas) from public.agents a join public.agent_templates t on t.id = a.template_id where a.id = x.agent_id))
     ), '{}')
   where x.implantacion_id = p_impl_id and x.plantilla_tarea_id is not null and x.estado <> 'hecha';
  return v_n;
end $$;

-- Sincroniza la implantación en curso de una empresa: genera lo que falte, marca lo que ya se cumple y, si está todo, la completa.
create function public.implantacion_sincronizar(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.implantaciones;
  c public.companies;
  v_nuevas integer := 0;
  v_marcadas integer := 0;
  v_completada boolean := false;
begin
  select * into i from public.implantaciones where company_id = p_company_id and estado = 'en_curso' for update;
  if not found then return jsonb_build_object('implantacion', false); end if;
  v_nuevas := public._implantacion_generar(i.id);

  update public.implantacion_tareas t
     set estado = 'hecha', hecha_en = now(), marcada_auto = true
   where t.implantacion_id = i.id and t.comprobacion is not null and t.estado in ('pendiente', 'en_curso')
     and public._implantacion_cumple(p_company_id, t.comprobacion, t.agent_id, t.proveedor);
  get diagnostics v_marcadas = row_count;

  if exists (select 1 from public.implantacion_tareas t where t.implantacion_id = i.id)
     and not exists (select 1 from public.implantacion_tareas t where t.implantacion_id = i.id and t.obligatoria and t.estado not in ('hecha', 'descartada'))
     and exists (select 1 from public.agents a where a.company_id = p_company_id and a.estado = 'activo') then
    update public.implantaciones set estado = 'completada', completada_en = now() where id = i.id;
    select * into c from public.companies where id = p_company_id for update;
    if c.estado = 'en_implantacion' then update public.companies set estado = 'activa' where id = p_company_id; end if;
    insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
    values (p_company_id, 'implantacion_completada', 'Tu oficina ya está en marcha',
            'Hemos terminado la puesta en marcha: tus agentes certificados ya trabajan. Tu responsable de SAMGPLE seguirá revisando cómo va.',
            jsonb_build_object('implantacion_id', i.id));
    insert into public.internal_alerts (tipo, company_id, detalle)
    values ('implantacion_completada', p_company_id, jsonb_build_object('implantacion_id', i.id, 'responsable', i.responsable, 'empresa', c.name));
    v_completada := true;
  end if;
  return jsonb_build_object('implantacion', true, 'nuevas', v_nuevas, 'marcadas', v_marcadas, 'completada', v_completada);
end $$;

-- Aplica (o cambia) la plantilla de una implantación y sincroniza. Las tareas ya creadas no se borran.
create function public.implantacion_aplicar_plantilla(p_implantacion_id uuid, p_template_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  if p_template_id is null then
    select id into p_template_id from public.onboarding_templates where por_defecto and activa;
  end if;
  if p_template_id is null or not exists (select 1 from public.onboarding_templates where id = p_template_id and activa) then
    raise exception 'PLANTILLA_NO_DISPONIBLE' using errcode = '22023';
  end if;
  update public.implantaciones set plantilla_id = p_template_id where id = p_implantacion_id and estado <> 'completada' returning company_id into v_company;
  if v_company is null then raise exception 'IMPLANTACION_NO_ENCONTRADA' using errcode = 'P0002'; end if;
  return public.implantacion_sincronizar(v_company);
end $$;

-- Cambiar a mano una tarea (SAMGPLE o el cliente). Reglas del servidor:
--  · No se marca «hecha» mientras alguna dependencia no esté hecha o descartada.
--  · El cliente solo marca tareas suyas sin comprobación automática (p. ej. «Revisar y aprobar la configuración de Sara»).
--  · Una tarea con comprobación automática solo la marca la comprobación; a mano se puede descartar (SAMGPLE) o reabrir.
create function public.implantacion_tarea_actualizar(
  p_tarea_id uuid, p_actor uuid, p_via text, p_estado text default null, p_responsable uuid default null,
  p_cambiar_responsable boolean default false, p_vence_en date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.implantacion_tareas;
  i public.implantaciones;
  v_pendientes text;
begin
  select * into t from public.implantacion_tareas where id = p_tarea_id for update;
  if not found then raise exception 'TAREA_NO_ENCONTRADA' using errcode = 'P0002'; end if;
  select * into i from public.implantaciones where id = t.implantacion_id;
  -- Completada la implantación, solo se siguen moviendo las opcionales (p. ej. las revisiones a la semana y al mes).
  if i.estado = 'completada' and t.obligatoria then raise exception 'IMPLANTACION_COMPLETADA: sus tareas obligatorias ya no se cambian' using errcode = '22023'; end if;

  if p_via = 'cliente' then
    if not exists (select 1 from public.company_members where company_id = i.company_id and user_id = p_actor and estado = 'activo' and rol in ('propietario', 'admin')) then
      raise exception 'SIN_PERMISO' using errcode = '42501';
    end if;
    if t.para <> 'cliente' or t.comprobacion is not null or p_estado is distinct from 'hecha' or p_cambiar_responsable or p_vence_en is not null then
      raise exception 'SIN_PERMISO: esta tarea no la marca el cliente' using errcode = '42501';
    end if;
  elsif p_via = 'samgple' then
    if not exists (select 1 from public.platform_roles where user_id = p_actor and activo) then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  else
    raise exception 'VIA_INVALIDA' using errcode = '22023';
  end if;

  if p_estado is not null then
    if p_estado not in ('pendiente', 'en_curso', 'hecha', 'descartada') then raise exception 'ESTADO_INVALIDO' using errcode = '22023'; end if;
    if p_estado = 'hecha' and t.comprobacion is not null and not public._implantacion_cumple(i.company_id, t.comprobacion, t.agent_id, t.proveedor) then
      raise exception 'SE_COMPRUEBA_SOLA: se marcará sola en cuanto esté hecha' using errcode = '22023';
    end if;
    if p_estado = 'hecha' then
      select string_agg(d.titulo, ', ') into v_pendientes from public.implantacion_tareas d
       where d.id = any (t.depende_de) and d.estado not in ('hecha', 'descartada');
      if v_pendientes is not null then raise exception 'DEPENDENCIAS_PENDIENTES: antes hay que terminar %', v_pendientes using errcode = '22023'; end if;
    end if;
    update public.implantacion_tareas
       set estado = p_estado,
           hecha_en = case when p_estado = 'hecha' then coalesce(hecha_en, now()) end,
           hecha_por = case when p_estado = 'hecha' then p_actor end,
           marcada_auto = false
     where id = t.id;
  end if;
  if p_cambiar_responsable then
    if p_responsable is not null and not exists (select 1 from public.platform_roles where user_id = p_responsable and activo) then
      raise exception 'RESPONSABLE_NO_VALIDO' using errcode = '22023';
    end if;
    update public.implantacion_tareas set responsable = p_responsable where id = t.id;
  end if;
  if p_vence_en is not null then update public.implantacion_tareas set vence_en = p_vence_en where id = t.id; end if;

  if i.estado = 'completada' then return jsonb_build_object('implantacion', false); end if;
  return public.implantacion_sincronizar(i.company_id);
end $$;

-- Guardar una plantilla con todas sus tareas (atómico). Se identifican por clave: las que ya no vienen se borran (las tareas
-- generadas conservan su copia), las demás se actualizan. Una tarea solo puede depender de tareas anteriores (sin ciclos).
create function public.onboarding_plantilla_guardar(p_template_id uuid, p_datos jsonb, p_actor uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_template_id;
  e jsonb;
  v_claves text[];
  v_orden integer := 0;
  v_dep text;
begin
  if not exists (select 1 from public.platform_roles where user_id = p_actor and activo and (roles && array['admin_samgple', 'implantacion_samgple'])) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if coalesce((p_datos ->> 'por_defecto')::boolean, false) then
    update public.onboarding_templates set por_defecto = false where por_defecto and id is distinct from v_id;
  end if;
  if v_id is null then
    insert into public.onboarding_templates (nombre, descripcion, por_defecto, activa, actualizado_por)
    values (p_datos ->> 'nombre', nullif(p_datos ->> 'descripcion', ''), coalesce((p_datos ->> 'por_defecto')::boolean, false), coalesce((p_datos ->> 'activa')::boolean, true), p_actor)
    returning id into v_id;
  else
    update public.onboarding_templates
       set nombre = p_datos ->> 'nombre', descripcion = nullif(p_datos ->> 'descripcion', ''), por_defecto = coalesce((p_datos ->> 'por_defecto')::boolean, false),
           activa = coalesce((p_datos ->> 'activa')::boolean, true), actualizado_en = now(), actualizado_por = p_actor
     where id = v_id;
    if not found then raise exception 'PLANTILLA_NO_ENCONTRADA' using errcode = 'P0002'; end if;
  end if;

  select coalesce(array_agg(x ->> 'clave'), '{}') into v_claves from jsonb_array_elements(coalesce(p_datos -> 'tareas', '[]')) x;
  if cardinality(v_claves) = 0 then raise exception 'SIN_TAREAS: la plantilla necesita al menos una tarea' using errcode = '22023'; end if;
  if cardinality(v_claves) <> (select count(distinct c) from unnest(v_claves) c) then raise exception 'CLAVE_REPETIDA' using errcode = '22023'; end if;
  delete from public.onboarding_template_tareas where template_id = v_id and clave <> all (v_claves);

  for e in select * from jsonb_array_elements(p_datos -> 'tareas') loop
    v_orden := v_orden + 1;
    -- Sin ciclos: cada dependencia debe estar ANTES en la lista.
    foreach v_dep in array coalesce(array(select jsonb_array_elements_text(e -> 'depende_de')), '{}') loop
      if not (v_dep = any (v_claves[1:v_orden - 1])) then
        raise exception 'DEPENDENCIA_INVALIDA: «%» depende de «%», que no existe o va después', e ->> 'clave', v_dep using errcode = '22023';
      end if;
    end loop;
    insert into public.onboarding_template_tareas (template_id, clave, titulo, para, ambito, proveedor, obligatoria, dias_objetivo, ayuda, comprobacion, accion, depende_de, orden)
    values (v_id, e ->> 'clave', e ->> 'titulo', e ->> 'para', coalesce(e ->> 'ambito', 'empresa'), nullif(e ->> 'proveedor', ''),
            coalesce((e ->> 'obligatoria')::boolean, true), coalesce((e ->> 'dias_objetivo')::integer, 7), nullif(e ->> 'ayuda', ''),
            nullif(e ->> 'comprobacion', ''), nullif(e ->> 'accion', ''), coalesce(array(select jsonb_array_elements_text(e -> 'depende_de')), '{}'), v_orden)
    on conflict (template_id, clave) do update set
      titulo = excluded.titulo, para = excluded.para, ambito = excluded.ambito, proveedor = excluded.proveedor, obligatoria = excluded.obligatoria,
      dias_objetivo = excluded.dias_objetivo, ayuda = excluded.ayuda, comprobacion = excluded.comprobacion, accion = excluded.accion,
      depende_de = excluded.depende_de, orden = excluded.orden;
  end loop;
  return v_id;
end $$;

-- 6) Disparadores: lo que se puede comprobar solo se marca en cuanto pasa ----------------------------------------------------------
-- Nunca bloquean la operación que los dispara: si la sincronización falla, se anota un aviso interno y se sigue.
create function public._implantacion_disparar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_company uuid := coalesce(new.company_id, old.company_id);
begin
  if exists (select 1 from public.implantaciones where company_id = v_company and estado = 'en_curso') then
    begin
      perform public.implantacion_sincronizar(v_company);
    exception when others then
      insert into public.internal_alerts (tipo, company_id, detalle) values ('error_sistema', v_company, jsonb_build_object('donde', 'implantacion_sincronizar', 'codigo', sqlstate));
    end;
  end if;
  return null;
end $$;

create trigger implantacion_miembros after insert or update of rol, estado on public.company_members
  for each row execute function public._implantacion_disparar();
create trigger implantacion_conexiones after insert or update of estado on public.company_connections
  for each row execute function public._implantacion_disparar();
create trigger implantacion_agentes after insert or update of estado, version_certificada on public.agents
  for each row execute function public._implantacion_disparar();
create trigger implantacion_certificacion after insert on public.certification_requests
  for each row execute function public._implantacion_disparar();
create trigger implantacion_fiscales after insert or update on public.empresa_datos_fiscales
  for each row execute function public._implantacion_disparar();
create trigger implantacion_conocimiento after insert or update of estado on public.agent_knowledge
  for each row execute function public._implantacion_disparar();

-- 7) Resumen para /admin/implantacion: progreso de las implantaciones en curso (solo metadatos) --------------------------------------
create function public.admin_implantaciones(p_hoy date default (now() at time zone 'Europe/Madrid')::date)
returns table (implantacion_id uuid, company_id uuid, empresa text, estado_empresa text, responsable_id uuid, responsable text, inicio date,
               objetivo_fin date, alta timestamptz, total integer, hechas integer, obligatorias integer, obligatorias_hechas integer,
               atrasadas integer, atrasadas_samgple integer, atrasadas_cliente integer, proxima text, proxima_vence date, plantilla text)
language sql stable set search_path = '' as $$
  select i.id, c.id, c.name, c.estado, i.responsable, pr.nombre, i.inicio, i.objetivo_fin, c.created_at,
         count(t.id) filter (where t.estado <> 'descartada')::integer,
         count(t.id) filter (where t.estado = 'hecha')::integer,
         count(t.id) filter (where t.obligatoria and t.estado <> 'descartada')::integer,
         count(t.id) filter (where t.obligatoria and t.estado = 'hecha')::integer,
         count(t.id) filter (where t.estado in ('pendiente', 'en_curso') and t.vence_en < p_hoy)::integer,
         count(t.id) filter (where t.estado in ('pendiente', 'en_curso') and t.vence_en < p_hoy and t.para = 'samgple')::integer,
         count(t.id) filter (where t.estado in ('pendiente', 'en_curso') and t.vence_en < p_hoy and t.para = 'cliente')::integer,
         (select t2.titulo from public.implantacion_tareas t2 where t2.implantacion_id = i.id and t2.estado in ('pendiente', 'en_curso') order by t2.vence_en nulls last, t2.orden limit 1),
         (select t2.vence_en from public.implantacion_tareas t2 where t2.implantacion_id = i.id and t2.estado in ('pendiente', 'en_curso') order by t2.vence_en nulls last, t2.orden limit 1),
         ot.nombre
    from public.implantaciones i
    join public.companies c on c.id = i.company_id
    left join public.implantacion_tareas t on t.implantacion_id = i.id
    left join public.platform_roles pr on pr.user_id = i.responsable
    left join public.onboarding_templates ot on ot.id = i.plantilla_id
   where i.estado in ('en_curso', 'pausada') and not c.es_examen and c.estado <> 'borrada'
   group by i.id, c.id, c.name, c.estado, i.responsable, pr.nombre, i.inicio, i.objetivo_fin, c.created_at, ot.nombre
   order by count(t.id) filter (where t.estado in ('pendiente', 'en_curso') and t.vence_en < p_hoy) desc, i.inicio
$$;

-- 8) RLS y permisos -------------------------------------------------------------------------------------------------------------------
alter table public.onboarding_templates enable row level security;
alter table public.onboarding_template_tareas enable row level security;
revoke all on public.onboarding_templates, public.onboarding_template_tareas from public, anon, authenticated;
grant select, insert, update, delete on public.onboarding_templates, public.onboarding_template_tareas to service_role;
revoke all on function public.empresa_operativa(text) from public, anon;
grant execute on function public.empresa_operativa(text) to authenticated, service_role;
revoke all on function public._nombre_integracion(text), public._implantacion_cumple(uuid, text, uuid, text), public._implantacion_generar(uuid),
  public.implantacion_sincronizar(uuid), public.implantacion_aplicar_plantilla(uuid, uuid),
  public.implantacion_tarea_actualizar(uuid, uuid, text, text, uuid, boolean, date), public.onboarding_plantilla_guardar(uuid, jsonb, uuid),
  public._implantacion_disparar(), public.admin_implantaciones(date) from public, anon, authenticated;
grant execute on function public._nombre_integracion(text), public._implantacion_cumple(uuid, text, uuid, text), public._implantacion_generar(uuid),
  public.implantacion_sincronizar(uuid), public.implantacion_aplicar_plantilla(uuid, uuid),
  public.implantacion_tarea_actualizar(uuid, uuid, text, text, uuid, boolean, date), public.onboarding_plantilla_guardar(uuid, jsonb, uuid),
  public.admin_implantaciones(date) to service_role;

-- 9) Plantilla estándar (editable desde /admin/implantacion/plantillas) ------------------------------------------------------------
with p as (
  insert into public.onboarding_templates (nombre, descripcion, por_defecto)
  values ('Estándar', 'Puesta en marcha habitual: invitación, conexiones, configuración de cada agente con el cliente, certificación y activación.', true)
  returning id
)
insert into public.onboarding_template_tareas (template_id, clave, titulo, para, ambito, obligatoria, dias_objetivo, ayuda, comprobacion, accion, depende_de, orden)
select p.id, v.* from p, (values
  ('aceptar_invitacion', 'Aceptar la invitación y entrar en tu oficina', 'cliente', 'empresa', true, 3, 'Usa el enlace del correo de bienvenida.', 'invitacion_aceptada', 'aceptar_invitacion', '{}'::text[], 1),
  ('llamada_arranque', 'Llamada de arranque con el cliente', 'samgple', 'empresa', true, 5, 'Objetivos, horarios, tono y quién aprueba.', null, null, '{}'::text[], 2),
  ('datos_fiscales', 'Completar los datos fiscales', 'cliente', 'empresa', true, 7, 'Para las facturas de servicios.', 'datos_fiscales', 'datos_fiscales', '{aceptar_invitacion}'::text[], 3),
  ('conectar', 'Conectar {integracion}', 'cliente', 'integracion', true, 7, 'Desde Conexiones, en tu oficina.', 'conexion', 'conectar', '{aceptar_invitacion}'::text[], 4),
  ('conocimiento', 'Subir documentos de conocimiento: servicios, precios y horarios', 'cliente', 'empresa', true, 7, 'Desde la ficha de cada agente, en Conocimiento.', 'conocimiento', 'conocimiento', '{aceptar_invitacion}'::text[], 5),
  ('configurar_departamentos', 'Configurar los departamentos', 'samgple', 'empresa', true, 7, null, null, null, '{llamada_arranque}'::text[], 6),
  ('configurar_agente', 'Configurar a {agente} con «Cuéntanos tu negocio»', 'samgple', 'agente', true, 10, 'Con el asistente de configuración de la ficha del agente.', null, null, '{configurar_departamentos,conectar}'::text[], 7),
  ('probar_agente', 'Probar a {agente} en el simulador', 'samgple', 'agente', true, 12, null, 'agente_probado', null, '{configurar_agente}'::text[], 8),
  ('aprobar_agente', 'Revisar y aprobar la configuración de {agente}', 'cliente', 'agente', true, 13, 'Prueba al agente en el simulador y dinos si está como quieres.', null, 'aprobar_agente', '{probar_agente}'::text[], 9),
  ('enviar_certificacion', 'Enviar a {agente} a certificación', 'samgple', 'agente', true, 14, null, 'agente_enviado', null, '{aprobar_agente}'::text[], 10),
  ('certificar_agente', 'Certificar a {agente}', 'samgple', 'agente', true, 17, 'Revisión del equipo de certificación de SAMGPLE.', 'agente_certificado', null, '{enviar_certificacion}'::text[], 11),
  ('activar_agente', 'Activar a {agente}', 'samgple', 'agente', true, 18, null, 'agente_activo', null, '{certificar_agente}'::text[], 12),
  ('revision_semana', 'Revisión a la semana con el cliente', 'samgple', 'empresa', false, 25, 'Cómo están trabajando los agentes y qué ajustar.', null, null, '{activar_agente}'::text[], 13),
  ('revision_mes', 'Revisión al mes con el cliente', 'samgple', 'empresa', false, 48, null, null, null, '{revision_semana}'::text[], 14)
) as v (clave, titulo, para, ambito, obligatoria, dias_objetivo, ayuda, comprobacion, accion, depende_de, orden);

comment on table public.onboarding_templates is 'Plantillas de implantación (SAMGPLE). Nunca las ve la empresa directamente.';
comment on column public.implantacion_tareas.estado is 'pendiente | en_curso | hecha | descartada; hecha_en se mantiene coherente con hecha.';
