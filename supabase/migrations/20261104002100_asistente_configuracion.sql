-- Fase 2 · Asistente de configuración del agente.
-- La empresa cuenta en lenguaje normal cómo es su negocio; el asistente (Claude Sonnet) propone la configuración y la empresa
-- la aplica. Aquí: el hilo de la conversación y la función ATÓMICA que aplica una propuesta y crea la versión nueva del agente.

-- 1) Hilo de la conversación -----------------------------------------------------------------------------------------------
create table public.agent_setup_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid not null,
  -- [{ "rol": "empresa" | "asistente", "texto": "…", "en": "2026-11-09T10:00:00Z" }]
  mensajes jsonb not null default '[]'::jsonb check (jsonb_typeof(mensajes) = 'array'),
  -- Última propuesta (null hasta el primer turno). No es la configuración del agente: no se aplica hasta que la empresa lo pide.
  propuesta_actual jsonb check (propuesta_actual is null or jsonb_typeof(propuesta_actual) = 'object'),
  -- Versión del agente sobre la que se hizo la propuesta: si cambia antes de aplicarla, hay que pedirla de nuevo.
  version_base integer not null check (version_base >= 1),
  estado text not null default 'abierta' check (estado in ('abierta', 'aplicada')),
  created_by uuid references public.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  aplicada_en timestamptz,
  unique (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade
);
create index agent_setup_sessions_agent_idx on public.agent_setup_sessions (company_id, agent_id, actualizado_en desc);
create trigger agent_setup_sessions_touch before update on public.agent_setup_sessions
  for each row execute function public.touch_actualizado_en();

alter table public.agent_setup_sessions enable row level security;
-- La empresa lee sus conversaciones; solo el servidor las escribe (el asistente cuesta créditos y no se puede lanzar desde el navegador).
create policy agent_setup_sessions_select on public.agent_setup_sessions for select to authenticated
  using (company_id = (select public.current_company_id()));
revoke all on public.agent_setup_sessions from anon, authenticated;
grant select on public.agent_setup_sessions to authenticated;
grant select, insert, update, delete on public.agent_setup_sessions to service_role;

-- 2) Foto de la configuración de un agente (para agent_versions) ----------------------------------------------------------
-- NUNCA incluye las instrucciones base de la plantilla: la empresa puede leer agent_versions.
create function public._agent_snapshot(p_company_id uuid, p_agent_id uuid)
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
    'herramientas', coalesce((select jsonb_agg(jsonb_build_object('tool_id', t.tool_id, 'permiso', t.permiso, 'limite_diario', t.limite_diario) order by t.tool_id)
                                from public.agent_tools t where t.company_id = a.company_id and t.agent_id = a.id), '[]'::jsonb),
    'reglas', (select to_jsonb(r) - 'agent_id' - 'company_id' from public.agent_rules r where r.company_id = a.company_id and r.agent_id = a.id),
    'traspasos', coalesce((select jsonb_agg(jsonb_build_object('agent_id_destino', h.agent_id_destino, 'condicion', h.condicion, 'tipo_traspaso', h.tipo_traspaso, 'activo', h.activo)
                                            order by h.agent_id_destino, h.condicion)
                              from public.agent_handoffs h where h.company_id = a.company_id and h.agent_id_origen = a.id), '[]'::jsonb)
  )
  from public.agents a where a.company_id = p_company_id and a.id = p_agent_id;
$$;
revoke all on function public._agent_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public._agent_snapshot(uuid, uuid) to service_role;

-- 3) Aplicar una propuesta (atómico: o se aplica todo y se crea la versión, o no se aplica nada) -----------------------------
-- p_cambios admite (todas opcionales): ficha {negocio_resumen, tono, objetivo, nunca_hace, instrucciones_empresa},
-- reglas {zona_horaria, horario, fuera_de_horario, mensaje_fuera_horario, idioma},
-- permisos [{tool_id, permiso}], traspasos [{agent_id_destino, condicion, tipo_traspaso}].
-- La base vuelve a comprobar lo que no puede dejar en manos del código: la plantilla del agente solo deja cambiar el permiso
-- de las herramientas marcadas como editables, y un traspaso solo puede ir a un agente de la misma empresa.
create function public.agent_aplicar_configuracion(
  p_company_id uuid, p_agent_id uuid, p_user_id uuid, p_session_id uuid, p_version_esperada integer, p_cambios jsonb, p_motivo text
) returns table (version integer, permisos_aplicados integer, traspasos_creados integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_item jsonb;
  v_ficha jsonb := coalesce(p_cambios -> 'ficha', '{}'::jsonb);
  v_reglas jsonb := p_cambios -> 'reglas';
  v_nueva integer;
  v_tpl jsonb;
  v_permisos integer := 0;
  v_traspasos integer := 0;
  v_filas integer;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  if v_agent.estado in ('en_certificacion', 'suspendido', 'archivado') then
    raise exception 'AGENTE_NO_EDITABLE: un agente en estado % no se puede reconfigurar', v_agent.estado using errcode = '42501';
  end if;
  if v_agent.version_actual is distinct from p_version_esperada then
    raise exception 'VERSION_CAMBIADA: el agente ha cambiado desde la propuesta (versión %)', v_agent.version_actual using errcode = '40001';
  end if;
  if p_session_id is not null and not exists (
    select 1 from public.agent_setup_sessions s where s.id = p_session_id and s.company_id = p_company_id and s.agent_id = p_agent_id and s.estado = 'abierta'
  ) then
    raise exception 'SESION_NO_VALIDA: la conversación no existe o ya se aplicó' using errcode = 'P0002';
  end if;

  -- Si todavía no hay foto de la versión actual, se guarda antes de cambiar nada (así se puede comparar y volver atrás).
  if not exists (select 1 from public.agent_versions av where av.agent_id = p_agent_id and av.version = v_agent.version_actual) then
    insert into public.agent_versions (agent_id, company_id, version, snapshot, motivo_cambio, created_by)
    values (p_agent_id, p_company_id, v_agent.version_actual, public._agent_snapshot(p_company_id, p_agent_id), 'estado anterior a la configuración con el asistente', p_user_id);
  end if;

  -- Ficha
  if v_ficha <> '{}'::jsonb then
    update public.agents set
      negocio_resumen = coalesce(v_ficha ->> 'negocio_resumen', negocio_resumen),
      tono = coalesce(v_ficha ->> 'tono', tono),
      objetivo = coalesce(v_ficha ->> 'objetivo', objetivo),
      nunca_hace = coalesce(v_ficha ->> 'nunca_hace', nunca_hace),
      instrucciones_empresa = coalesce(v_ficha ->> 'instrucciones_empresa', instrucciones_empresa)
    where company_id = p_company_id and id = p_agent_id;
  end if;

  -- Reglas
  if v_reglas is not null and v_reglas <> '{}'::jsonb then
    insert into public.agent_rules (agent_id, company_id) values (p_agent_id, p_company_id) on conflict (agent_id) do nothing;
    update public.agent_rules set
      zona_horaria = coalesce(v_reglas ->> 'zona_horaria', zona_horaria),
      horario = coalesce(v_reglas -> 'horario', horario),
      fuera_de_horario = coalesce(v_reglas ->> 'fuera_de_horario', fuera_de_horario),
      mensaje_fuera_horario = case when v_reglas ? 'mensaje_fuera_horario' then v_reglas ->> 'mensaje_fuera_horario' else mensaje_fuera_horario end,
      idioma = coalesce(v_reglas ->> 'idioma', idioma)
    where company_id = p_company_id and agent_id = p_agent_id;
  end if;

  -- Permisos de herramientas
  if v_agent.template_id is not null then
    select herramientas_disponibles into v_tpl from public.agent_templates where id = v_agent.template_id;
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_cambios -> 'permisos', '[]'::jsonb)) loop
    if v_agent.template_id is not null and not exists (
      select 1 from jsonb_array_elements(v_tpl) e
       where e ->> 'id' = v_item ->> 'tool_id'
         and (coalesce((e ->> 'editable')::boolean, false) or e ->> 'permiso_defecto' = v_item ->> 'permiso')
    ) then
      raise exception 'HERRAMIENTA_NO_PERMITIDA: la plantilla no ofrece «%» o no deja cambiar su permiso a «%»', v_item ->> 'tool_id', v_item ->> 'permiso' using errcode = '42501';
    end if;
    insert into public.agent_tools (agent_id, company_id, tool_id, permiso) values (p_agent_id, p_company_id, v_item ->> 'tool_id', v_item ->> 'permiso')
      on conflict (agent_id, tool_id) do update set permiso = excluded.permiso
      where public.agent_tools.permiso is distinct from excluded.permiso;
    get diagnostics v_filas = row_count;
    v_permisos := v_permisos + v_filas;
  end loop;

  -- Traspasos (se añaden; no se borran los que ya hay). Las claves compuestas impiden un destino de otra empresa.
  for v_item in select * from jsonb_array_elements(coalesce(p_cambios -> 'traspasos', '[]'::jsonb)) loop
    insert into public.agent_handoffs (company_id, agent_id_origen, agent_id_destino, condicion, tipo_traspaso)
    select p_company_id, p_agent_id, (v_item ->> 'agent_id_destino')::uuid, v_item ->> 'condicion', v_item ->> 'tipo_traspaso'
     where not exists (
       select 1 from public.agent_handoffs h
        where h.company_id = p_company_id and h.agent_id_origen = p_agent_id and h.agent_id_destino = (v_item ->> 'agent_id_destino')::uuid and h.condicion = v_item ->> 'condicion'
     );
    get diagnostics v_filas = row_count;
    v_traspasos := v_traspasos + v_filas;
  end loop;

  -- Versión nueva
  v_nueva := v_agent.version_actual + 1;
  update public.agents set version_actual = v_nueva where company_id = p_company_id and id = p_agent_id;
  insert into public.agent_versions (agent_id, company_id, version, snapshot, motivo_cambio, created_by)
  values (p_agent_id, p_company_id, v_nueva, public._agent_snapshot(p_company_id, p_agent_id), coalesce(nullif(trim(p_motivo), ''), 'configuración con el asistente'), p_user_id);

  if p_session_id is not null then
    update public.agent_setup_sessions set estado = 'aplicada', aplicada_en = now() where id = p_session_id and company_id = p_company_id;
  end if;
  return query select v_nueva, v_permisos, v_traspasos;
end;
$$;
revoke all on function public.agent_aplicar_configuracion(uuid, uuid, uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.agent_aplicar_configuracion(uuid, uuid, uuid, uuid, integer, jsonb, text) to service_role;
