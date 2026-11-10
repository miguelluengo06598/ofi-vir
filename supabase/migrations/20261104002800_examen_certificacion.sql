-- Fase 2 · Examen técnico de certificación (antes de la revisión humana).
-- Se ejecuta en una empresa ficticia (companies.es_examen), siempre en modo simulación, sobre la versión enviada.

-- 1) Empresa de examen: marcada, para que ningún panel ni tarea periódica la trate como una empresa cliente -------------------
alter table public.companies add column es_examen boolean not null default false;

-- 2) Tipos de solicitud: se añade «cambio_menor» (tono, textos, horario, conocimiento, endurecer permisos: solo examen técnico) ------
alter table public.certification_requests drop constraint certification_requests_tipo_check;
alter table public.certification_requests add constraint certification_requests_tipo_check
  check (tipo in ('nueva', 'cambio_menor', 'cambio_importante', 'periodica', 'cambio_modelo', 'plantilla'));
-- Una sola solicitud abierta por agente (si el examen suspende, la empresa puede enviar otra).
create unique index certification_requests_una_abierta_idx on public.certification_requests (agent_id)
  where estado in ('pendiente_examen', 'pendiente_revision', 'en_revision', 'segunda_opinion');

-- 3) Informe para la empresa: qué bloque falló, qué casos y cómo corregirlo (sin respuestas del agente: podrían citar instrucciones base) --
alter table public.certification_exams add column informe jsonb;
drop view public.certification_exams_empresa;
create view public.certification_exams_empresa with (security_barrier = true) as
select id, request_id, company_id, agent_id, agent_version, resultado, nota_global, bloques, informe, creado_en
  from public.certification_exams
 where company_id = (select public.current_company_id());
revoke all on public.certification_exams_empresa from anon;
grant select on public.certification_exams_empresa to authenticated;

-- 4) Casos de prueba propios de la empresa (agentes propios: mínimo 10 para el examen) ----------------------------------------------
create table public.agent_test_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid not null,
  titulo text not null check (length(titulo) between 1 and 200),
  entrada text not null check (length(entrada) between 1 and 2000),
  esperado text not null check (length(esperado) between 1 and 1000),
  debe_usar text[] not null default '{}',
  no_debe_usar text[] not null default '{}',
  creado_en timestamptz not null default now(),
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade
);
create index agent_test_cases_agent_idx on public.agent_test_cases (company_id, agent_id);
alter table public.agent_test_cases enable row level security;
create policy agent_test_cases_select on public.agent_test_cases for select to authenticated using (company_id = (select public.current_company_id()));
create policy agent_test_cases_write on public.agent_test_cases for all to authenticated
  using (company_id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'))
  with check (company_id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'));
grant select, insert, update, delete on public.agent_test_cases to authenticated, service_role;

-- 5) Enviar a certificación (atómico) --------------------------------------------------------------------------------------------
-- Crea la solicitud de la versión actual del agente. Un agente que aún no trabaja (borrador / en pruebas) pasa a «en certificación»;
-- uno ya certificado sigue trabajando con su versión certificada mientras tanto.
create function public.certificacion_enviar(p_company_id uuid, p_agent_id uuid, p_user_id uuid, p_tipo text, p_via text, p_resumen text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_id uuid;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  if v_agent.estado in ('en_certificacion', 'archivado', 'suspendido') then
    raise exception 'El agente está en estado % y no se puede enviar a certificación', v_agent.estado using errcode = 'P0001';
  end if;
  insert into public.certification_requests (company_id, agent_id, agent_version, tipo, via, estado, resumen_cambios, enviado_por)
  values (p_company_id, p_agent_id, v_agent.version_actual, p_tipo, p_via, 'pendiente_examen', left(p_resumen, 2000), p_user_id)
  returning id into v_id;
  if v_agent.estado in ('borrador', 'en_pruebas', 'rechazado') then
    update public.agents set estado = 'en_certificacion' where id = p_agent_id;
  end if;
  return v_id;
end;
$$;

-- 6) Registrar el resultado del examen (atómico) -----------------------------------------------------------------------------------
-- Suspendido → «examen_suspendido» (el agente vuelve a «en pruebas» si no trabajaba). Aprobado → un cambio menor se certifica aquí mismo
-- como versión nueva (sin revisión humana); cualquier otro tipo pasa a «pendiente_revision». Devuelve el estado final de la solicitud.
create function public.certificacion_registrar_examen(
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
    update public.certification_requests set estado = v_estado where id = p_request_id;
    if v_agent.estado = 'en_certificacion' then update public.agents set estado = 'en_pruebas' where id = v_agent.id; end if;
  elsif v_req.tipo = 'cambio_menor' and v_agent.version_certificada is not null then
    v_estado := 'aprobada';
    update public.certification_requests set estado = v_estado, resuelto_en = now() where id = p_request_id;
    insert into public.certifications (company_id, agent_id, agent_version, request_id, caduca_en)
    values (p_company_id, v_req.agent_id, v_req.agent_version, p_request_id, now() + interval '6 months');
    update public.agents
       set version_certificada = v_req.agent_version, certificado_hasta = now() + interval '6 months',
           estado = case when v_agent.estado in ('en_certificacion', 'en_pruebas', 'borrador', 'rechazado') then 'certificado' else v_agent.estado end
     where id = v_agent.id;
  else
    v_estado := 'pendiente_revision';
    update public.certification_requests set estado = v_estado where id = p_request_id;
  end if;
  return v_estado;
end;
$$;

-- Solicitudes pendientes de examen (para el proceso en segundo plano).
create function public.certificacion_pendientes_examen(p_limite integer default 10)
returns table (company_id uuid, request_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.company_id, r.id from public.certification_requests r where r.estado = 'pendiente_examen' order by r.enviado_en limit greatest(p_limite, 1)
$$;

revoke all on function public.certificacion_enviar(uuid, uuid, uuid, text, text, text), public.certificacion_pendientes_examen(integer),
  public.certificacion_registrar_examen(uuid, uuid, text, numeric, text, jsonb, jsonb, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.certificacion_enviar(uuid, uuid, uuid, text, text, text), public.certificacion_pendientes_examen(integer),
  public.certificacion_registrar_examen(uuid, uuid, text, numeric, text, jsonb, jsonb, jsonb, bigint) to service_role;

-- El conocimiento ficticio de la empresa de examen no lo crea ninguna persona: un nodo `conocimiento` puede no tener autor
-- (el resto de nodos siguen necesitando exactamente uno: un agente o una persona).
alter table public.memory_nodes drop constraint memory_nodes_check;
alter table public.memory_nodes add constraint memory_nodes_check
  check (num_nonnulls(created_by_agent_id, created_by_user_id) = 1 or (node_type = 'conocimiento' and num_nonnulls(created_by_agent_id, created_by_user_id) = 0));
