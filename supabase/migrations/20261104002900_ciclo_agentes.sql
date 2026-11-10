-- Fase 2 · Ciclo de vida de los agentes: estados, versiones, correcciones, plantillas actualizadas, recertificación y avisos.
--
-- Idea central: las tablas «vivas» (agents, agent_tools, agent_rules, agent_handoffs, agent_corrections activas) contienen SIEMPRE
-- la configuración de la versión QUE TRABAJA. Mientras un agente no está certificado, cada cambio se aplica directamente (y crea
-- versión). En cuanto tiene una versión certificada (certificado / activo / pausado), un cambio solo crea una versión nueva en
-- agent_versions (snapshot completo) y NO toca las tablas vivas: el agente sigue trabajando con la versión certificada hasta que
-- la nueva se certifica; entonces su snapshot se aplica a las tablas vivas en la misma transacción.

-- 1) Columnas nuevas ---------------------------------------------------------------------------------------------------------------
alter table public.agents
  add column template_version integer check (template_version >= 1),   -- versión de la plantilla con la que trabaja el agente
  add column pausado_motivo text;                                       -- 'empresa' | 'certificacion_caducada'
update public.agents a set template_version = t.version from public.agent_templates t where a.template_id = t.id;

alter table public.agent_templates add column novedades text;   -- resumen de cambios de la versión actual (lo ve la empresa)

alter table public.certifications add column es_dato_de_prueba boolean not null default false;

alter table public.certification_requests
  add column motivos jsonb not null default '[]'::jsonb check (jsonb_typeof(motivos) = 'array'),   -- por qué es menor o importante
  add column comentario_empresa text,   -- comentario del revisor PARA la empresa (nunca las notas internas)
  add column modelo_examen text;        -- solo «cambio_modelo»: el modelo de IA con el que se repite el examen

-- Correcciones: «pendiente» (espera al examen de su versión) → «activa» (entra en las instrucciones) → «retirada».
alter table public.agent_corrections
  add column estado text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'retirada'));
update public.agent_corrections set estado = case when activa then 'activa' else 'retirada' end;
alter table public.agent_corrections alter column activa set default false;
alter table public.agent_corrections add constraint agent_corrections_estado_coherente check (activa = (estado = 'activa'));
-- Las correcciones pasan por el examen técnico antes de entrar en las instrucciones: solo las escribe el servidor.
drop policy agent_corrections_write on public.agent_corrections;
revoke insert, update, delete on public.agent_corrections from authenticated;

-- Avisos: se conservan TODOS los tipos anteriores.
alter table public.notifications drop constraint notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check check (tipo in (
  'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica',
  'lote_por_caducar', 'oficina_pausada', 'borrado_programado', 'bono_renovado',
  'conexion_caducada', 'limite_mensajes_agente', 'tope_creditos_agente',
  'traspaso_cortado',
  'certificacion_estado', 'certificacion_caducada', 'agente_sin_certificar'
));

-- 2) Historial de versiones de las plantillas (interno de IDESIE) -----------------------------------------------------------------
-- Un agente trabaja con la versión de la plantilla con la que se certificó: si IDESIE publica otra, el agente NO cambia solo.
create table public.agent_template_versions (
  template_id text not null references public.agent_templates (id),
  version integer not null check (version >= 1),
  instrucciones_base text not null,   -- PROTEGIDA, igual que en agent_templates
  herramientas_disponibles jsonb not null default '[]'::jsonb,
  integraciones_requeridas jsonb not null default '[]'::jsonb,
  novedades text,
  creado_en timestamptz not null default now(),
  primary key (template_id, version)
);
alter table public.agent_template_versions enable row level security;   -- sin políticas: ninguna empresa la lee
revoke all on public.agent_template_versions from anon, authenticated;
grant select, insert, update, delete on public.agent_template_versions to service_role;
insert into public.agent_template_versions (template_id, version, instrucciones_base, herramientas_disponibles, integraciones_requeridas, novedades)
select id, version, instrucciones_base, herramientas_disponibles, integraciones_requeridas, novedades from public.agent_templates;

create function public.agent_templates_guardar_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.agent_template_versions (template_id, version, instrucciones_base, herramientas_disponibles, integraciones_requeridas, novedades)
  values (new.id, new.version, new.instrucciones_base, new.herramientas_disponibles, new.integraciones_requeridas, new.novedades)
  on conflict (template_id, version) do update
    set instrucciones_base = excluded.instrucciones_base, herramientas_disponibles = excluded.herramientas_disponibles,
        integraciones_requeridas = excluded.integraciones_requeridas, novedades = excluded.novedades;
  return new;
end;
$$;
create trigger agent_templates_guardar_version after insert or update on public.agent_templates
  for each row execute function public.agent_templates_guardar_version();

-- Al enlazar un agente con una plantilla se fija la versión de la plantilla con la que nace.
create function public.agents_fijar_version_plantilla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.template_id is null then
    new.template_version := null;
  elsif new.template_version is null
     or (tg_op = 'UPDATE' and new.template_id is distinct from old.template_id and new.template_version is not distinct from old.template_version) then
    select t.version into new.template_version from public.agent_templates t where t.id = new.template_id;
  end if;
  return new;
end;
$$;
create trigger agents_fijar_version_plantilla before insert or update of template_id, template_version on public.agents
  for each row execute function public.agents_fijar_version_plantilla();

-- La vista pública de plantillas enseña también las novedades de la versión actual.
create or replace view public.agent_templates_public with (security_barrier = true) as
select id, nombre_por_defecto, rol, departamento_tipo, descripcion_publica, que_hace, que_no_hace,
       herramientas_disponibles, integraciones_requeridas, tipo_tarea_por_defecto, version, creado_en, actualizado_en,
       public.plantilla_certificada(id) as certificada, novedades
  from public.agent_templates
 where activa;

-- 3) La empresa no puede cambiar a mano la configuración de un agente que ya tiene (o espera) certificación -------------------------
-- Desde el navegador (authenticated) solo se edita directamente un agente en borrador, en pruebas o rechazado. El resto de cambios
-- pasan por el servidor, que crea una versión nueva y la envía a certificación.
create function public._agente_editable_a_mano(p_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.estado in ('borrador', 'en_pruebas', 'rechazado') from public.agents a where a.id = p_agent_id), true)
$$;
revoke all on function public._agente_editable_a_mano(uuid) from public, anon;
grant execute on function public._agente_editable_a_mano(uuid) to authenticated, service_role;

create function public.agent_config_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_agent uuid;
begin
  if current_user not in ('authenticated', 'anon') then return coalesce(new, old); end if;
  if tg_table_name = 'agent_handoffs' then
    if tg_op = 'DELETE' then v_agent := old.agent_id_origen; else v_agent := new.agent_id_origen; end if;
  else
    if tg_op = 'DELETE' then v_agent := old.agent_id; else v_agent := new.agent_id; end if;
  end if;
  if not public._agente_editable_a_mano(v_agent) then
    raise exception 'AGENTE_CERTIFICADO: la configuración de un agente certificado o en certificación solo cambia creando una versión nueva'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger agent_tools_config_proteger before insert or update or delete on public.agent_tools
  for each row execute function public.agent_config_proteger();
create trigger agent_rules_config_proteger before insert or update or delete on public.agent_rules
  for each row execute function public.agent_config_proteger();
create trigger agent_handoffs_config_proteger before insert or update or delete on public.agent_handoffs
  for each row execute function public.agent_config_proteger();

create function public.agents_proteger_config()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.template_version is distinct from old.template_version then
    raise exception 'AGENTE_CICLO: la versión de la plantilla solo la cambia el servidor' using errcode = '42501';
  end if;
  if old.estado not in ('borrador', 'en_pruebas', 'rechazado') and (
       new.name is distinct from old.name or new.role is distinct from old.role or new.model is distinct from old.model
    or new.tono is distinct from old.tono or new.objetivo is distinct from old.objetivo or new.nunca_hace is distinct from old.nunca_hace
    or new.instrucciones_empresa is distinct from old.instrucciones_empresa or new.negocio_resumen is distinct from old.negocio_resumen
    or new.instructions is distinct from old.instructions or new.allowed_tools is distinct from old.allowed_tools
  ) then
    raise exception 'AGENTE_CERTIFICADO: la configuración de un agente certificado o en certificación solo cambia creando una versión nueva'
      using errcode = '42501';
  end if;
  -- El motivo de la pausa no se escribe a mano: lo fija el cambio de estado.
  new.pausado_motivo := case when new.estado is not distinct from old.estado then old.pausado_motivo when new.estado = 'pausado' then 'empresa' else null end;
  return new;
end;
$$;
create trigger agents_proteger_config before update on public.agents
  for each row execute function public.agents_proteger_config();

-- Nota: un error P0002 llega a la API con estado 500 y su mensaje debe ser ASCII (con acentos, el cuerpo llega ilegible y se pierde
-- el código): por eso esos mensajes van sin tildes; el texto que ve la empresa lo pone el servidor. Y nunca se usa 40001 para un
-- conflicto de versión: la API responde 504 (PostgREST parece tratarlo como un fallo de serialización y reintentar).

-- 4) Foto de la configuración (ahora con correcciones activas y versión de la plantilla) ---------------------------------------------
create or replace function public._agent_snapshot(p_company_id uuid, p_agent_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ficha', jsonb_build_object(
      'nombre', a.name, 'rol', a.role, 'template_id', a.template_id, 'modelo', a.model,
      'negocio_resumen', a.negocio_resumen, 'tono', a.tono, 'objetivo', a.objetivo,
      'nunca_hace', a.nunca_hace, 'instrucciones_empresa', a.instrucciones_empresa
    ),
    'plantilla_version', a.template_version,
    'herramientas', coalesce((select jsonb_agg(jsonb_build_object('tool_id', t.tool_id, 'permiso', t.permiso, 'limite_diario', t.limite_diario) order by t.tool_id)
                                from public.agent_tools t where t.company_id = a.company_id and t.agent_id = a.id), '[]'::jsonb),
    'reglas', (select to_jsonb(r) - 'agent_id' - 'company_id' from public.agent_rules r where r.company_id = a.company_id and r.agent_id = a.id),
    'traspasos', coalesce((select jsonb_agg(jsonb_build_object('agent_id_destino', h.agent_id_destino, 'condicion', h.condicion, 'tipo_traspaso', h.tipo_traspaso, 'activo', h.activo)
                                            order by h.agent_id_destino, h.condicion)
                              from public.agent_handoffs h where h.company_id = a.company_id and h.agent_id_origen = a.id), '[]'::jsonb),
    'correcciones', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'regla', c.regla_aprendida) order by c.creado_en, c.id)
                                from public.agent_corrections c
                               where c.company_id = a.company_id and c.agent_id = a.id and c.estado = 'activa' and c.regla_aprendida is not null), '[]'::jsonb)
  )
  from public.agents a where a.company_id = p_company_id and a.id = p_agent_id;
$$;

-- Foto de una versión; si es la actual y aún no tiene foto, la guarda (la configuración viva ES esa versión).
create function public._agent_version_snapshot(p_company_id uuid, p_agent_id uuid, p_version integer, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snap jsonb;
  v_actual integer;
begin
  select snapshot into v_snap from public.agent_versions where company_id = p_company_id and agent_id = p_agent_id and version = p_version;
  if v_snap is not null then return v_snap; end if;
  select version_actual into v_actual from public.agents where company_id = p_company_id and id = p_agent_id;
  if v_actual is distinct from p_version then
    raise exception 'VERSION_NO_ENCONTRADA: no existe la version % del agente', p_version using errcode = 'P0002';
  end if;
  v_snap := public._agent_snapshot(p_company_id, p_agent_id);
  insert into public.agent_versions (agent_id, company_id, version, snapshot, motivo_cambio, created_by)
  values (p_agent_id, p_company_id, p_version, v_snap, 'configuración inicial', p_user_id);
  return v_snap;
end;
$$;

-- Aplica una foto a las tablas vivas (la versión que trabaja). Solo la llaman las funciones de este archivo.
create function public._agent_aplicar_snapshot(p_company_id uuid, p_agent_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ficha jsonb := coalesce(p_snapshot -> 'ficha', '{}'::jsonb);
  v_reglas jsonb := p_snapshot -> 'reglas';
  v_r public.agent_rules;
begin
  update public.agents set
    name = coalesce(v_ficha ->> 'nombre', name),
    role = coalesce(v_ficha ->> 'rol', role),
    model = coalesce(v_ficha ->> 'modelo', model),
    negocio_resumen = coalesce(v_ficha ->> 'negocio_resumen', negocio_resumen),
    tono = coalesce(v_ficha ->> 'tono', tono),
    objetivo = coalesce(v_ficha ->> 'objetivo', objetivo),
    nunca_hace = coalesce(v_ficha ->> 'nunca_hace', nunca_hace),
    instrucciones_empresa = coalesce(v_ficha ->> 'instrucciones_empresa', instrucciones_empresa),
    template_version = case when template_id is null then null else coalesce((p_snapshot ->> 'plantilla_version')::integer, template_version) end
  where company_id = p_company_id and id = p_agent_id;

  -- Herramientas: exactamente las de la foto.
  delete from public.agent_tools t
   where t.company_id = p_company_id and t.agent_id = p_agent_id
     and not exists (select 1 from jsonb_array_elements(coalesce(p_snapshot -> 'herramientas', '[]'::jsonb)) e where e ->> 'tool_id' = t.tool_id);
  insert into public.agent_tools (agent_id, company_id, tool_id, permiso, limite_diario)
  select p_agent_id, p_company_id, e ->> 'tool_id', e ->> 'permiso', (e ->> 'limite_diario')::integer
    from jsonb_array_elements(coalesce(p_snapshot -> 'herramientas', '[]'::jsonb)) e
  on conflict (agent_id, tool_id) do update set permiso = excluded.permiso, limite_diario = excluded.limite_diario;

  -- Reglas: las de la foto (las columnas que una foto antigua no tenga conservan su valor por defecto).
  if v_reglas is null or jsonb_typeof(v_reglas) <> 'object' then
    delete from public.agent_rules where company_id = p_company_id and agent_id = p_agent_id;
  else
    delete from public.agent_rules where company_id = p_company_id and agent_id = p_agent_id;
    insert into public.agent_rules (agent_id, company_id) values (p_agent_id, p_company_id) returning * into v_r;
    v_r := jsonb_populate_record(v_r, v_reglas - 'agent_id' - 'company_id');
    delete from public.agent_rules where company_id = p_company_id and agent_id = p_agent_id;
    insert into public.agent_rules select v_r.*;
  end if;

  -- Traspasos: exactamente los de la foto (un destino que ya no exista se omite).
  delete from public.agent_handoffs h
   where h.company_id = p_company_id and h.agent_id_origen = p_agent_id
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_snapshot -> 'traspasos', '[]'::jsonb)) e
        where (e ->> 'agent_id_destino')::uuid = h.agent_id_destino and e ->> 'condicion' = h.condicion and e ->> 'tipo_traspaso' = h.tipo_traspaso
     );
  update public.agent_handoffs h set activo = coalesce((e ->> 'activo')::boolean, true)
    from jsonb_array_elements(coalesce(p_snapshot -> 'traspasos', '[]'::jsonb)) e
   where h.company_id = p_company_id and h.agent_id_origen = p_agent_id
     and (e ->> 'agent_id_destino')::uuid = h.agent_id_destino and e ->> 'condicion' = h.condicion and e ->> 'tipo_traspaso' = h.tipo_traspaso
     and h.activo is distinct from coalesce((e ->> 'activo')::boolean, true);
  insert into public.agent_handoffs (company_id, agent_id_origen, agent_id_destino, condicion, tipo_traspaso, activo)
  select distinct on (d.id, e ->> 'condicion', e ->> 'tipo_traspaso')
         p_company_id, p_agent_id, d.id, e ->> 'condicion', e ->> 'tipo_traspaso', coalesce((e ->> 'activo')::boolean, true)
    from jsonb_array_elements(coalesce(p_snapshot -> 'traspasos', '[]'::jsonb)) e
    join public.agents d on d.company_id = p_company_id and d.id = (e ->> 'agent_id_destino')::uuid and d.id <> p_agent_id
   where not exists (
     select 1 from public.agent_handoffs h
      where h.company_id = p_company_id and h.agent_id_origen = p_agent_id and h.agent_id_destino = d.id
        and h.condicion = e ->> 'condicion' and h.tipo_traspaso = e ->> 'tipo_traspaso'
   );

  -- Correcciones: las de la foto quedan activas; las activas que no estén, retiradas. Una foto antigua sin la clave no las toca.
  if p_snapshot ? 'correcciones' then
    update public.agent_corrections c set estado = 'retirada', activa = false
     where c.company_id = p_company_id and c.agent_id = p_agent_id and c.estado = 'activa'
       and not exists (select 1 from jsonb_array_elements(p_snapshot -> 'correcciones') e where (e ->> 'id')::uuid = c.id);
    update public.agent_corrections c set estado = 'activa', activa = true, regla_aprendida = e ->> 'regla'
      from jsonb_array_elements(p_snapshot -> 'correcciones') e
     where c.company_id = p_company_id and c.agent_id = p_agent_id and c.id = (e ->> 'id')::uuid
       and (c.estado <> 'activa' or c.regla_aprendida is distinct from e ->> 'regla');
  end if;
end;
$$;

-- 5) Guardar una versión nueva (atómico) ----------------------------------------------------------------------------------------------
-- p_snapshot es la configuración COMPLETA de la versión nueva. La base comprueba lo que no puede dejar en manos del código:
-- plantilla inmutable, permisos que la plantilla deja cambiar, traspasos dentro de la empresa y máximo de correcciones.
-- Devuelve {version, aplicada, trabaja}: «aplicada» = ya está en las tablas vivas (agente sin certificar); «trabaja» = el agente
-- sigue trabajando con su versión certificada y la nueva espera a certificarse.
create function public.agent_version_guardar(
  p_company_id uuid, p_agent_id uuid, p_user_id uuid, p_snapshot jsonb, p_motivo text, p_version_esperada integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_snap jsonb := p_snapshot;
  v_pv integer;
  v_tpl jsonb;
  v_item jsonb;
  v_nueva integer;
  v_trabaja boolean;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  if v_agent.estado in ('en_certificacion', 'suspendido', 'archivado') then
    raise exception 'AGENTE_NO_EDITABLE: un agente en estado % no se puede reconfigurar', v_agent.estado using errcode = '42501';
  end if;
  if exists (select 1 from public.certification_requests r where r.agent_id = p_agent_id
              and r.estado in ('pendiente_examen', 'pendiente_revision', 'en_revision', 'segunda_opinion')) then
    raise exception 'SOLICITUD_ABIERTA: hay una versión de este agente en certificación; espera al resultado o cancela la solicitud' using errcode = 'P0001';
  end if;
  if p_version_esperada is not null and v_agent.version_actual is distinct from p_version_esperada then
    raise exception 'VERSION_CAMBIADA: el agente ha cambiado (version %)', v_agent.version_actual using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_snap) is distinct from 'object' or jsonb_typeof(v_snap -> 'ficha') is distinct from 'object'
     or jsonb_typeof(coalesce(v_snap -> 'herramientas', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(v_snap -> 'traspasos', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_snap -> 'correcciones', '[]'::jsonb)) <> 'array' then
    raise exception 'SNAPSHOT_INVALIDO: la configuración no tiene la forma esperada' using errcode = '22023';
  end if;
  if (v_snap -> 'ficha' ->> 'template_id') is distinct from v_agent.template_id then
    raise exception 'PLANTILLA_INMUTABLE: no se puede cambiar la plantilla de un agente' using errcode = '42501';
  end if;

  -- Plantilla: la versión con la que trabaja el agente u otra que esté certificada. Los permisos, los que esa versión deja.
  if v_agent.template_id is not null then
    v_pv := coalesce((v_snap ->> 'plantilla_version')::integer, v_agent.template_version);
    if v_pv is distinct from v_agent.template_version and not public.plantilla_certificada(v_agent.template_id, v_pv) then
      raise exception 'PLANTILLA_SIN_CERTIFICAR: la versión % de la plantilla no está certificada', v_pv using errcode = '42501';
    end if;
    v_snap := jsonb_set(v_snap, '{plantilla_version}', to_jsonb(v_pv));
    select herramientas_disponibles into v_tpl from public.agent_template_versions where template_id = v_agent.template_id and version = v_pv;
    if v_tpl is null then select herramientas_disponibles into v_tpl from public.agent_templates where id = v_agent.template_id; end if;
    for v_item in select * from jsonb_array_elements(coalesce(v_snap -> 'herramientas', '[]'::jsonb)) loop
      if not exists (
        select 1 from jsonb_array_elements(v_tpl) e
         where e ->> 'id' = v_item ->> 'tool_id'
           and (coalesce((e ->> 'editable')::boolean, false) or e ->> 'permiso_defecto' = v_item ->> 'permiso')
      ) then
        raise exception 'HERRAMIENTA_NO_PERMITIDA: la plantilla no ofrece «%» o no deja cambiar su permiso a «%»', v_item ->> 'tool_id', v_item ->> 'permiso' using errcode = '42501';
      end if;
    end loop;
  else
    v_snap := jsonb_set(v_snap, '{plantilla_version}', 'null'::jsonb);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(v_snap -> 'traspasos', '[]'::jsonb)) loop
    if (v_item ->> 'agent_id_destino')::uuid = p_agent_id or not exists (
      select 1 from public.agents d where d.company_id = p_company_id and d.id = (v_item ->> 'agent_id_destino')::uuid
    ) then
      raise exception 'TRASPASO_NO_PERMITIDO: un traspaso solo puede ir a otro agente de la misma empresa' using errcode = '42501';
    end if;
  end loop;

  if jsonb_array_length(coalesce(v_snap -> 'correcciones', '[]'::jsonb)) > 30 then
    raise exception 'MAX_CORRECCIONES: un agente puede tener como máximo 30 correcciones activas' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(v_snap -> 'correcciones', '[]'::jsonb)) loop
    if not exists (select 1 from public.agent_corrections c where c.company_id = p_company_id and c.agent_id = p_agent_id and c.id = (v_item ->> 'id')::uuid) then
      raise exception 'CORRECCION_NO_VALIDA: la corrección no es de este agente' using errcode = '42501';
    end if;
  end loop;

  -- La versión actual queda fotografiada antes de cambiar nada (para comparar y poder volver atrás).
  perform public._agent_version_snapshot(p_company_id, p_agent_id, v_agent.version_actual, p_user_id);

  v_trabaja := v_agent.estado in ('certificado', 'activo', 'pausado') and v_agent.version_certificada is not null;
  v_nueva := v_agent.version_actual + 1;
  insert into public.agent_versions (agent_id, company_id, version, snapshot, motivo_cambio, created_by)
  values (p_agent_id, p_company_id, v_nueva, v_snap, coalesce(nullif(trim(p_motivo), ''), 'cambio de configuración'), p_user_id);
  update public.agents set version_actual = v_nueva where company_id = p_company_id and id = p_agent_id;
  if not v_trabaja then
    perform public._agent_aplicar_snapshot(p_company_id, p_agent_id, v_snap);
  end if;
  -- Las correcciones pendientes que la versión nueva ya no incluye quedan retiradas.
  update public.agent_corrections c set estado = 'retirada', activa = false
   where c.company_id = p_company_id and c.agent_id = p_agent_id and c.estado = 'pendiente'
     and not exists (select 1 from jsonb_array_elements(coalesce(v_snap -> 'correcciones', '[]'::jsonb)) e where (e ->> 'id')::uuid = c.id);
  return jsonb_build_object('version', v_nueva, 'aplicada', not v_trabaja, 'trabaja', v_trabaja);
end;
$$;

-- El asistente de configuración sigue usando su función, pero en un agente que ya trabaja NO toca la versión certificada:
-- se carga la última versión, se aplica la propuesta, se fotografía como versión nueva y se restaura la versión que trabaja.
-- Todo en la misma transacción: nadie ve el estado intermedio.
alter function public.agent_aplicar_configuracion(uuid, uuid, uuid, uuid, integer, jsonb, text) rename to _agent_aplicar_configuracion_directa;
revoke all on function public._agent_aplicar_configuracion_directa(uuid, uuid, uuid, uuid, integer, jsonb, text) from public, anon, authenticated, service_role;

create function public.agent_aplicar_configuracion(
  p_company_id uuid, p_agent_id uuid, p_user_id uuid, p_session_id uuid, p_version_esperada integer, p_cambios jsonb, p_motivo text
) returns table (version integer, permisos_aplicados integer, traspasos_creados integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_trabaja jsonb;
  v_ultima jsonb;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  if not (v_agent.estado in ('certificado', 'activo', 'pausado') and v_agent.version_certificada is not null) then
    return query select * from public._agent_aplicar_configuracion_directa(p_company_id, p_agent_id, p_user_id, p_session_id, p_version_esperada, p_cambios, p_motivo);
    return;
  end if;
  if exists (select 1 from public.certification_requests r where r.agent_id = p_agent_id
              and r.estado in ('pendiente_examen', 'pendiente_revision', 'en_revision', 'segunda_opinion')) then
    raise exception 'SOLICITUD_ABIERTA: hay una versión de este agente en certificación; espera al resultado o cancela la solicitud' using errcode = 'P0001';
  end if;
  -- La foto de la versión que trabaja, completada con lo que una foto antigua no guardaba (ahora mismo las tablas vivas SON esa versión).
  v_trabaja := public._agent_snapshot(p_company_id, p_agent_id) || public._agent_version_snapshot(p_company_id, p_agent_id, v_agent.version_certificada, p_user_id);
  if v_agent.version_actual <> v_agent.version_certificada then
    v_ultima := public._agent_version_snapshot(p_company_id, p_agent_id, v_agent.version_actual, p_user_id);
    perform public._agent_aplicar_snapshot(p_company_id, p_agent_id, v_ultima);
  end if;
  return query select * from public._agent_aplicar_configuracion_directa(p_company_id, p_agent_id, p_user_id, p_session_id, p_version_esperada, p_cambios, p_motivo);
  perform public._agent_aplicar_snapshot(p_company_id, p_agent_id, v_trabaja);
  -- Las correcciones que solo están en la versión nueva vuelven a «pendiente» (esperan a su examen).
  update public.agent_corrections c set estado = 'pendiente', activa = false
    from public.agents a join public.agent_versions v on v.agent_id = a.id and v.version = a.version_actual
   where a.id = p_agent_id and c.company_id = p_company_id and c.agent_id = p_agent_id and c.estado = 'retirada'
     and exists (select 1 from jsonb_array_elements(coalesce(v.snapshot -> 'correcciones', '[]'::jsonb)) e where (e ->> 'id')::uuid = c.id)
     and not exists (select 1 from jsonb_array_elements(coalesce(v_trabaja -> 'correcciones', '[]'::jsonb)) e where (e ->> 'id')::uuid = c.id);
end;
$$;

-- 6) Certificar una versión (interno): la versión pasa a ser la que trabaja -------------------------------------------------------------
create function public._agente_certificar(p_company_id uuid, p_agent_id uuid, p_version integer, p_request_id uuid, p_caduca timestamptz, p_de_prueba boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snap jsonb;
begin
  v_snap := public._agent_version_snapshot(p_company_id, p_agent_id, p_version);
  update public.certifications set estado = 'caducada'
   where company_id = p_company_id and agent_id = p_agent_id and agent_version = p_version and estado = 'vigente';
  insert into public.certifications (company_id, agent_id, agent_version, request_id, caduca_en, es_dato_de_prueba)
  values (p_company_id, p_agent_id, p_version, p_request_id, p_caduca, p_de_prueba);
  perform public._agent_aplicar_snapshot(p_company_id, p_agent_id, v_snap);
  update public.agents set
    version_certificada = p_version, certificado_hasta = p_caduca,
    estado = case
      when estado in ('borrador', 'en_pruebas', 'en_certificacion', 'rechazado') then 'certificado'
      when estado = 'pausado' and pausado_motivo = 'certificacion_caducada' then 'activo'   -- se pausó solo por caducar: vuelve a trabajar
      else estado end,
    pausado_motivo = case when estado = 'pausado' and pausado_motivo = 'empresa' then pausado_motivo else null end
  where company_id = p_company_id and id = p_agent_id;
end;
$$;

-- 7) Enviar a certificación (atómico) ---------------------------------------------------------------------------------------------------
drop function public.certificacion_enviar(uuid, uuid, uuid, text, text, text);
create function public.certificacion_enviar(
  p_company_id uuid, p_agent_id uuid, p_user_id uuid, p_tipo text, p_via text, p_resumen text,
  p_motivos jsonb default '[]'::jsonb, p_version integer default null, p_modelo_examen text default null, p_ahora timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_version integer;
  v_id uuid;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  if v_agent.estado not in ('en_pruebas', 'rechazado', 'certificado', 'activo', 'pausado') then
    raise exception 'El agente está en estado % y no se puede enviar a certificación', v_agent.estado using errcode = 'P0001';
  end if;
  v_version := coalesce(p_version, v_agent.version_actual);
  if p_tipo in ('periodica', 'cambio_modelo') then
    if v_agent.version_certificada is null then raise exception 'El agente no tiene ninguna versión certificada' using errcode = 'P0001'; end if;
    v_version := v_agent.version_certificada;
  elsif v_agent.estado in ('certificado', 'activo', 'pausado') and v_version = v_agent.version_certificada then
    raise exception 'La versión % ya es la certificada: no hay cambios que certificar', v_version using errcode = 'P0001';
  end if;
  perform public._agent_version_snapshot(p_company_id, p_agent_id, v_version, p_user_id);   -- la versión enviada queda fijada
  insert into public.certification_requests (company_id, agent_id, agent_version, tipo, via, estado, resumen_cambios, motivos, enviado_por, enviado_en, modelo_examen)
  values (p_company_id, p_agent_id, v_version, p_tipo, p_via, 'pendiente_examen', left(p_resumen, 2000), coalesce(p_motivos, '[]'::jsonb), p_user_id, p_ahora, p_modelo_examen)
  returning id into v_id;
  if v_agent.estado in ('en_pruebas', 'rechazado') then
    update public.agents set estado = 'en_certificacion' where id = p_agent_id;
  end if;
  return v_id;
end;
$$;

-- 8) Resultado del examen (atómico) -------------------------------------------------------------------------------------------------------
-- Suspendido → «examen_suspendido» (un agente que aún no trabajaba vuelve a «en pruebas»; uno que trabaja sigue con su versión).
-- Aprobado → cambio menor: se certifica aquí como versión nueva · cambio de modelo: queda aprobada sin tocar la certificación ·
-- el resto (nueva, cambio importante, periódica, plantilla): pasa a la revisión humana.
create or replace function public.certificacion_registrar_examen(
  p_company_id uuid, p_request_id uuid, p_resultado text, p_nota numeric, p_modelo text, p_bloques jsonb, p_casos jsonb, p_informe jsonb, p_coste bigint
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.certification_requests;
  v_agent public.agents;
  v_estado text;
begin
  select * into v_req from public.certification_requests where company_id = p_company_id and id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if v_req.estado <> 'pendiente_examen' then raise exception 'La solicitud ya no está pendiente de examen (%)', v_req.estado using errcode = 'P0001'; end if;
  select * into v_agent from public.agents where company_id = p_company_id and id = v_req.agent_id for update;

  insert into public.certification_exams (request_id, company_id, agent_id, agent_version, modelo_ia, resultado, nota_global, bloques, casos, informe, coste_ia_usd_micros)
  values (p_request_id, p_company_id, v_req.agent_id, v_req.agent_version, p_modelo, p_resultado, p_nota, p_bloques, p_casos, p_informe, p_coste);

  if p_resultado = 'suspendido' then
    v_estado := 'examen_suspendido';
    if v_agent.estado = 'en_certificacion' then update public.agents set estado = 'en_pruebas' where id = v_agent.id; end if;
    update public.certification_requests set estado = v_estado, resuelto_en = now() where id = p_request_id;
  elsif v_req.tipo = 'cambio_menor' and v_agent.version_certificada is not null then
    v_estado := 'aprobada';
    perform public._agente_certificar(p_company_id, v_req.agent_id, v_req.agent_version, p_request_id, now() + interval '6 months');
    update public.certification_requests set estado = v_estado, resuelto_en = now() where id = p_request_id;
  elsif v_req.tipo = 'cambio_modelo' then
    v_estado := 'aprobada';
    update public.certification_requests set estado = v_estado, resuelto_en = now() where id = p_request_id;
  else
    v_estado := 'pendiente_revision';
    update public.certification_requests set estado = v_estado where id = p_request_id;
  end if;
  return v_estado;
end;
$$;

-- 9) Resolución de la revisión humana (atómico; la pantalla del revisor llegará con el panel de IDESIE) ----------------------------------
-- aprobar → la versión queda certificada 6 meses y pasa a ser la que trabaja · rechazar → un agente que aún no trabajaba queda
-- «rechazado» (la empresa corrige y reenvía); uno que trabaja sigue con su versión certificada.
create function public.certificacion_resolver(p_company_id uuid, p_request_id uuid, p_decision text, p_comentario text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.certification_requests;
  v_estado text;
begin
  select * into v_req from public.certification_requests where company_id = p_company_id and id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if v_req.estado not in ('pendiente_revision', 'en_revision', 'segunda_opinion') then
    raise exception 'La solicitud no está en revisión (%)', v_req.estado using errcode = 'P0001';
  end if;
  perform 1 from public.agents where company_id = p_company_id and id = v_req.agent_id for update;
  if p_decision = 'aprobar' then
    v_estado := 'aprobada';
    perform public._agente_certificar(p_company_id, v_req.agent_id, v_req.agent_version, p_request_id, now() + interval '6 months');
  elsif p_decision = 'rechazar' then
    v_estado := 'rechazada';
    update public.agents set estado = 'rechazado' where company_id = p_company_id and id = v_req.agent_id and estado = 'en_certificacion';
  else
    raise exception 'Decisión no válida: %', p_decision using errcode = '22023';
  end if;
  update public.certification_requests set estado = v_estado, resuelto_en = now(), comentario_empresa = nullif(trim(left(p_comentario, 2000)), '')
   where id = p_request_id;
  return v_estado;
end;
$$;

create function public.certificacion_cancelar(p_company_id uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.certification_requests;
begin
  select * into v_req from public.certification_requests where company_id = p_company_id and id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if v_req.estado not in ('pendiente_examen', 'pendiente_revision', 'en_revision', 'segunda_opinion') then
    raise exception 'La solicitud ya está resuelta (%)', v_req.estado using errcode = 'P0001';
  end if;
  update public.certification_requests set estado = 'cancelada', resuelto_en = now() where id = p_request_id;
  update public.agents set estado = 'en_pruebas' where company_id = p_company_id and id = v_req.agent_id and estado = 'en_certificacion';
end;
$$;

-- 10) Cambios de estado que decide la empresa (atómico) ---------------------------------------------------------------------------------
-- probar: borrador → en_pruebas · activar: certificado | pausado → activo (solo con certificación vigente) ·
-- pausar: activo → pausado (las tareas en curso terminan; las nuevas no se lanzan) · archivar.
create function public.agente_cambiar_estado(p_company_id uuid, p_agent_id uuid, p_accion text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_nuevo text;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  if p_accion = 'probar' then
    if v_agent.estado <> 'borrador' then return v_agent.estado; end if;
    v_nuevo := 'en_pruebas';
  elsif p_accion = 'activar' then
    if v_agent.estado not in ('certificado', 'pausado') then
      raise exception 'TRANSICION_NO_PERMITIDA: un agente en estado % no se puede activar', v_agent.estado using errcode = 'P0001';
    end if;
    if v_agent.version_certificada is null or v_agent.certificado_hasta is null or v_agent.certificado_hasta <= now() or not exists (
      select 1 from public.certifications c
       where c.company_id = p_company_id and c.agent_id = p_agent_id and c.agent_version = v_agent.version_certificada
         and c.estado = 'vigente' and c.caduca_en > now()
    ) then
      raise exception 'SIN_CERTIFICAR: solo un agente con la certificación vigente puede activarse' using errcode = 'P0001';
    end if;
    v_nuevo := 'activo';
  elsif p_accion = 'pausar' then
    if v_agent.estado <> 'activo' then
      raise exception 'TRANSICION_NO_PERMITIDA: solo se puede pausar un agente activo (está %)', v_agent.estado using errcode = 'P0001';
    end if;
    v_nuevo := 'pausado';
  elsif p_accion = 'archivar' then
    if v_agent.estado in ('en_certificacion', 'suspendido') then
      raise exception 'TRANSICION_NO_PERMITIDA: un agente en estado % no se puede archivar', v_agent.estado using errcode = 'P0001';
    end if;
    update public.certification_requests set estado = 'cancelada', resuelto_en = now()
     where agent_id = p_agent_id and estado in ('pendiente_examen', 'pendiente_revision', 'en_revision', 'segunda_opinion');
    v_nuevo := 'archivado';
  else
    raise exception 'Acción no válida: %', p_accion using errcode = '22023';
  end if;
  update public.agents set estado = v_nuevo, pausado_motivo = case when v_nuevo = 'pausado' then 'empresa' else null end
   where company_id = p_company_id and id = p_agent_id;
  return v_nuevo;
end;
$$;

-- 11) Volver a una versión anterior (atómico) ---------------------------------------------------------------------------------------------
-- Crea una versión nueva igual a la antigua. Si aquella estaba certificada y su certificación no ha caducado (ni se retiró, ni la de
-- su plantilla), la nueva hereda esa certificación (misma fecha de caducidad) y pasa a trabajar sin nueva revisión.
create function public.agent_version_restaurar(p_company_id uuid, p_agent_id uuid, p_user_id uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_snap jsonb;
  v_r jsonb;
  v_cert public.certifications;
  v_reactivada boolean := false;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  if p_version = v_agent.version_actual then raise exception 'Esa ya es la versión actual' using errcode = 'P0001'; end if;
  select snapshot into v_snap from public.agent_versions where company_id = p_company_id and agent_id = p_agent_id and version = p_version;
  if v_snap is null then raise exception 'VERSION_NO_ENCONTRADA: no existe la version % del agente', p_version using errcode = 'P0002'; end if;
  -- Las correcciones de aquella versión que ya no existan no vuelven.
  if v_snap ? 'correcciones' then
    v_snap := jsonb_set(v_snap, '{correcciones}', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(v_snap -> 'correcciones') e
       where exists (select 1 from public.agent_corrections c where c.company_id = p_company_id and c.agent_id = p_agent_id and c.id = (e ->> 'id')::uuid)
    ), '[]'::jsonb));
  end if;
  v_snap := jsonb_set(v_snap, '{traspasos}', coalesce((
    select jsonb_agg(e) from jsonb_array_elements(coalesce(v_snap -> 'traspasos', '[]'::jsonb)) e
     where exists (select 1 from public.agents d where d.company_id = p_company_id and d.id = (e ->> 'agent_id_destino')::uuid)
  ), '[]'::jsonb));
  v_r := public.agent_version_guardar(p_company_id, p_agent_id, p_user_id, v_snap, format('vuelta a la versión %s', p_version), v_agent.version_actual);

  select * into v_cert from public.certifications c
   where c.company_id = p_company_id and c.agent_id = p_agent_id and c.agent_version = p_version and c.estado = 'vigente' and c.caduca_en > now()
   order by c.caduca_en desc limit 1;
  if found and (v_agent.template_id is null or public.plantilla_certificada(v_agent.template_id, coalesce((v_snap ->> 'plantilla_version')::integer, v_agent.template_version))) then
    perform public._agente_certificar(p_company_id, p_agent_id, (v_r ->> 'version')::integer, v_cert.request_id, v_cert.caduca_en, v_cert.es_dato_de_prueba);
    v_reactivada := true;
  end if;
  return v_r || jsonb_build_object('reactivada', v_reactivada, 'desde', p_version);
end;
$$;

-- 12) Correcciones («Recordar para la próxima») ------------------------------------------------------------------------------------------
-- Guardar una corrección crea una versión nueva que la incluye (cambio menor: pasa el examen técnico antes de entrar en las
-- instrucciones de un agente que ya trabaja). Máximo 30 por agente.
create function public.agent_correccion_crear(
  p_company_id uuid, p_agent_id uuid, p_user_id uuid, p_contexto text, p_original text, p_corregida text, p_regla text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_base jsonb;
  v_id uuid;
  v_regla text := trim(regexp_replace(coalesce(p_regla, ''), '\s+', ' ', 'g'));
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  if length(v_regla) < 3 or length(v_regla) > 200 then
    raise exception 'REGLA_INVALIDA: la regla debe tener entre 3 y 200 caracteres' using errcode = '22023';
  end if;
  v_base := public._agent_version_snapshot(p_company_id, p_agent_id, v_agent.version_actual, p_user_id);
  if not (v_base ? 'correcciones') then
    v_base := jsonb_set(v_base, '{correcciones}', public._agent_snapshot(p_company_id, p_agent_id) -> 'correcciones');
  end if;
  if jsonb_array_length(v_base -> 'correcciones') >= 30 then
    raise exception 'MAX_CORRECCIONES: un agente puede tener como máximo 30 correcciones activas; retira alguna antes de añadir otra' using errcode = 'P0001';
  end if;
  insert into public.agent_corrections (company_id, agent_id, contexto, respuesta_original, respuesta_corregida, regla_aprendida, activa, estado, created_by)
  values (p_company_id, p_agent_id, left(p_contexto, 4000), left(p_original, 8000), left(p_corregida, 8000), v_regla, false, 'pendiente', p_user_id)
  returning id into v_id;
  v_base := jsonb_set(v_base, '{correcciones}', (v_base -> 'correcciones') || jsonb_build_object('id', v_id, 'regla', v_regla));
  return public.agent_version_guardar(p_company_id, p_agent_id, p_user_id, v_base, 'Corrección: ' || v_regla, v_agent.version_actual)
         || jsonb_build_object('correccion_id', v_id);
end;
$$;

create function public.agent_correccion_retirar(p_company_id uuid, p_agent_id uuid, p_user_id uuid, p_correccion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_base jsonb;
  v_c public.agent_corrections;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  select * into v_c from public.agent_corrections where company_id = p_company_id and agent_id = p_agent_id and id = p_correccion_id;
  if not found or v_c.estado = 'retirada' then raise exception 'CORRECCION_NO_ENCONTRADA: no existe esa correccion' using errcode = 'P0002'; end if;
  v_base := public._agent_version_snapshot(p_company_id, p_agent_id, v_agent.version_actual, p_user_id);
  if not (v_base ? 'correcciones') then
    v_base := jsonb_set(v_base, '{correcciones}', public._agent_snapshot(p_company_id, p_agent_id) -> 'correcciones');
  end if;
  v_base := jsonb_set(v_base, '{correcciones}', coalesce((
    select jsonb_agg(e) from jsonb_array_elements(v_base -> 'correcciones') e where (e ->> 'id')::uuid <> p_correccion_id
  ), '[]'::jsonb));
  return public.agent_version_guardar(p_company_id, p_agent_id, p_user_id, v_base, 'Se retira la corrección: ' || coalesce(v_c.regla_aprendida, ''), v_agent.version_actual);
end;
$$;

-- 13) Recertificación periódica (tarea diaria) ---------------------------------------------------------------------------------------------
-- · Certificación vencida: el agente activo pasa a «pausado» con su motivo y se avisa a la empresa.
-- · A falta de p_dias (30) días: se crea una solicitud «periódica» de la versión certificada (una por periodo) y se avisa.
create function public.certificacion_recertificacion_diaria(p_ahora timestamptz, p_dias integer default 30, p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.agents;
  v_pausados uuid[] := '{}';
  v_solicitadas uuid[] := '{}';
  v_via text;
  v_dias integer;
begin
  for a in
    select ag.* from public.agents ag join public.companies c on c.id = ag.company_id and not c.es_examen
     where ag.estado = 'activo' and ag.certificado_hasta <= p_ahora and (p_company_id is null or ag.company_id = p_company_id)
     for update of ag
  loop
    update public.agents set estado = 'pausado', pausado_motivo = 'certificacion_caducada' where id = a.id;
    insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
    values (a.company_id, 'certificacion_caducada', format('%s está en pausa: su certificación ha caducado', a.name),
            format('La certificación de %s caducó el %s sin renovarse. No ejecutará tareas nuevas hasta que vuelva a certificarse.', a.name, to_char(a.certificado_hasta at time zone 'Europe/Madrid', 'DD/MM/YYYY')),
            jsonb_build_object('agent_id', a.id, 'motivo', 'certificacion_caducada'));
    v_pausados := v_pausados || a.id;
  end loop;
  update public.certifications set estado = 'caducada'
   where estado = 'vigente' and caduca_en <= p_ahora and (p_company_id is null or company_id = p_company_id);

  for a in
    select ag.* from public.agents ag join public.companies c on c.id = ag.company_id and not c.es_examen
     where ag.estado in ('activo', 'certificado', 'pausado') and ag.version_certificada is not null
       and ag.certificado_hasta > p_ahora and ag.certificado_hasta <= p_ahora + make_interval(days => p_dias)
       and (p_company_id is null or ag.company_id = p_company_id)
       and not exists (select 1 from public.certification_requests r where r.agent_id = ag.id
                        and r.estado in ('pendiente_examen', 'pendiente_revision', 'en_revision', 'segunda_opinion'))
       and not exists (select 1 from public.certification_requests r where r.agent_id = ag.id and r.tipo = 'periodica'
                        and r.enviado_en >= ag.certificado_hasta - make_interval(days => p_dias + 1))
     for update of ag
  loop
    v_via := case when a.template_id is not null and public.plantilla_certificada(a.template_id, a.template_version) then 'rapida_plantilla' else 'completa' end;
    v_dias := greatest(round(extract(epoch from (a.certificado_hasta - p_ahora)) / 86400)::integer, 0);
    perform public.certificacion_enviar(a.company_id, a.id, null, 'periodica', v_via,
      format('Recertificación periódica: la certificación caduca el %s (quedan %s días).', to_char(a.certificado_hasta at time zone 'Europe/Madrid', 'DD/MM/YYYY'), v_dias),
      '[]'::jsonb, null, null, p_ahora);
    v_solicitadas := v_solicitadas || a.id;
  end loop;
  return jsonb_build_object('pausados', to_jsonb(v_pausados), 'solicitadas', to_jsonb(v_solicitadas));
end;
$$;

-- 14) ¿Puede trabajar? + aviso -------------------------------------------------------------------------------------------------------------
-- El motor la llama antes de cada tarea real. Si no puede, la tarea no se ejecuta y la empresa recibe un aviso (uno al día por agente).
create function public.agente_comprobar_trabajo(p_company_id uuid, p_agent_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id;
  if not found then return false; end if;
  if public.agente_puede_trabajar(p_agent_id) then return true; end if;
  if not exists (select 1 from public.notifications n
                  where n.company_id = p_company_id and n.tipo = 'agente_sin_certificar' and n.metadatos ->> 'agent_id' = p_agent_id::text
                    and n.creado_en > now() - interval '1 day') then
    insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
    values (p_company_id, 'agente_sin_certificar', format('%s no ha ejecutado una tarea', v_agent.name),
            format('%s está en estado «%s» y solo un agente activo con la certificación vigente puede trabajar con datos reales. La tarea ha quedado en revisión.', v_agent.name, replace(v_agent.estado, '_', ' ')),
            jsonb_build_object('agent_id', p_agent_id, 'estado', v_agent.estado));
  end if;
  return false;
end;
$$;

-- 15) Avisos a la empresa en cada cambio de estado de la certificación ---------------------------------------------------------------------
-- Con el comentario del revisor para la empresa (certification_requests.comentario_empresa o el de su revisión). NUNCA las notas internas.
create function public.certificacion_avisar_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_examen boolean;
  v_titulo text;
  v_cuerpo text;
  v_comentario text;
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then return new; end if;
  select a.name, c.es_examen into v_nombre, v_examen
    from public.agents a join public.companies c on c.id = a.company_id where a.id = new.agent_id;
  if coalesce(v_examen, false) then return new; end if;

  v_comentario := new.comentario_empresa;
  if v_comentario is null and new.estado in ('aprobada', 'rechazada') then
    select r.comentario_para_empresa into v_comentario from public.certification_reviews r
     where r.request_id = new.id and r.comentario_para_empresa is not null order by r.creado_en desc limit 1;
  end if;

  v_titulo := case new.estado
    when 'pendiente_examen' then case new.tipo
      when 'periodica' then format('%s necesita renovar su certificación', v_nombre)
      when 'cambio_modelo' then format('%s repite el examen técnico por un cambio de modelo de IA', v_nombre)
      else format('%s se ha enviado a certificación', v_nombre) end
    when 'examen_suspendido' then format('%s no ha superado el examen técnico', v_nombre)
    when 'pendiente_revision' then format('%s ha superado el examen técnico', v_nombre)
    when 'en_revision' then format('IDESIE está revisando a %s', v_nombre)
    when 'segunda_opinion' then format('La certificación de %s necesita una segunda opinión', v_nombre)
    when 'aprobada' then case when new.tipo = 'cambio_modelo' then format('%s ha superado el examen con el nuevo modelo de IA', v_nombre) else format('%s está certificado', v_nombre) end
    when 'rechazada' then format('La certificación de %s se ha rechazado', v_nombre)
    else format('Se ha cancelado la certificación de %s', v_nombre) end;
  v_cuerpo := case new.estado
    when 'pendiente_examen' then coalesce(new.resumen_cambios, '') || case when new.tipo in ('periodica', 'cambio_modelo') then '' else ' El examen técnico empieza enseguida.' end
    when 'examen_suspendido' then 'Consulta el informe del examen para ver qué bloque ha fallado y cómo corregirlo. ' || case when new.tipo in ('nueva') then 'El agente vuelve a «en pruebas».' else 'El agente sigue trabajando con su versión certificada.' end
    when 'pendiente_revision' then 'Ahora pasa a la revisión de IDESIE' || case when new.via = 'rapida_plantilla' then ' por la vía rápida (plantilla certificada).' else '.' end
    when 'en_revision' then 'Un revisor de IDESIE está comprobando la versión enviada.'
    when 'segunda_opinion' then 'Otro revisor de IDESIE dará una segunda opinión antes de decidir.'
    when 'aprobada' then case when new.tipo = 'cambio_modelo' then 'No hace falta hacer nada.' else format('La versión %s queda certificada y es la que trabaja a partir de ahora.', new.agent_version) end
    when 'rechazada' then 'Corrige lo indicado y vuelve a enviar a certificación.'
    else 'La solicitud ya no está en curso.' end;
  if v_comentario is not null and new.estado in ('aprobada', 'rechazada', 'pendiente_revision', 'en_revision', 'segunda_opinion') then
    v_cuerpo := v_cuerpo || ' Comentario del revisor: ' || v_comentario;
  end if;

  insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
  values (new.company_id, 'certificacion_estado', v_titulo, trim(v_cuerpo),
          jsonb_build_object('agent_id', new.agent_id, 'request_id', new.id, 'estado', new.estado, 'tipo', new.tipo, 'version', new.agent_version));
  return new;
end;
$$;
create trigger certification_requests_avisar after insert or update of estado on public.certification_requests
  for each row execute function public.certificacion_avisar_estado();

-- 16) Permisos: todo esto es del servidor ---------------------------------------------------------------------------------------------------
revoke all on function
  public.agent_templates_guardar_version(), public.agents_fijar_version_plantilla(), public.certificacion_avisar_estado(),
  public._agent_version_snapshot(uuid, uuid, integer, uuid), public._agent_aplicar_snapshot(uuid, uuid, jsonb),
  public.agent_version_guardar(uuid, uuid, uuid, jsonb, text, integer),
  public.agent_aplicar_configuracion(uuid, uuid, uuid, uuid, integer, jsonb, text),
  public._agente_certificar(uuid, uuid, integer, uuid, timestamptz, boolean),
  public.certificacion_enviar(uuid, uuid, uuid, text, text, text, jsonb, integer, text, timestamptz),
  public.certificacion_resolver(uuid, uuid, text, text), public.certificacion_cancelar(uuid, uuid),
  public.agente_cambiar_estado(uuid, uuid, text), public.agent_version_restaurar(uuid, uuid, uuid, integer),
  public.agent_correccion_crear(uuid, uuid, uuid, text, text, text, text), public.agent_correccion_retirar(uuid, uuid, uuid, uuid),
  public.certificacion_recertificacion_diaria(timestamptz, integer, uuid), public.agente_comprobar_trabajo(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public._agent_version_snapshot(uuid, uuid, integer, uuid),
  public.agent_version_guardar(uuid, uuid, uuid, jsonb, text, integer),
  public.agent_aplicar_configuracion(uuid, uuid, uuid, uuid, integer, jsonb, text),
  public._agente_certificar(uuid, uuid, integer, uuid, timestamptz, boolean),
  public.certificacion_enviar(uuid, uuid, uuid, text, text, text, jsonb, integer, text, timestamptz),
  public.certificacion_resolver(uuid, uuid, text, text), public.certificacion_cancelar(uuid, uuid),
  public.agente_cambiar_estado(uuid, uuid, text), public.agent_version_restaurar(uuid, uuid, uuid, integer),
  public.agent_correccion_crear(uuid, uuid, uuid, text, text, text, text), public.agent_correccion_retirar(uuid, uuid, uuid, uuid),
  public.certificacion_recertificacion_diaria(timestamptz, integer, uuid), public.agente_comprobar_trabajo(uuid, uuid)
  to service_role;
