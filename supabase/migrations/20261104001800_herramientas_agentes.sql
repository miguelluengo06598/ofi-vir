-- Fase 2 · Catálogo de herramientas: registro de llamadas, tareas para el equipo de la empresa y traspaso a un agente concreto.
-- Lo escribe solo el servidor (service_role); la empresa solo lee lo suyo.

-- 1) Registro de cada llamada a una herramienta --------------------------------------------------------------------------
create table public.tool_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  task_id uuid,                -- null en el simulador sin tarea
  agent_id uuid not null,
  tool_id text not null,
  -- Entrada resumida y sin secretos (se recorta); NO es el texto completo.
  entrada_resumen text not null default '',
  resultado text not null check (resultado in (
    'ok', 'error', 'no_disponible', 'integracion_no_conectada', 'pendiente_aprobacion', 'aprobada', 'rechazada',
    'limite', 'entrada_invalida', 'salida_invalida', 'pasada_a_humano', 'bloqueada'
  )),
  detalle text not null default '',
  permiso text check (permiso in ('sola', 'aprobacion', 'humano', 'prohibida')),   -- el permiso que se aplicó
  duracion_ms integer not null default 0 check (duracion_ms >= 0),
  approval_id uuid,
  es_simulacion boolean not null default false,
  creado_en timestamptz not null default now(),
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade,
  foreign key (company_id, task_id) references public.tasks (company_id, id) on delete cascade,
  foreign key (company_id, approval_id) references public.approvals (company_id, id) on delete cascade
);
create index tool_calls_agent_dia_idx on public.tool_calls (company_id, agent_id, tool_id, creado_en desc);
create index tool_calls_task_idx on public.tool_calls (company_id, task_id) where task_id is not null;
-- Una aprobación se consume UNA sola vez (aprobada o rechazada): evita ejecutar dos veces lo aprobado.
create unique index tool_calls_aprobacion_unica on public.tool_calls (approval_id) where resultado in ('aprobada', 'rechazada');

-- 2) Tareas para el equipo de la empresa («pasar a humano») ----------------------------------------------------------------
create table public.human_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid not null,
  task_id uuid,
  contact_id uuid,
  titulo text not null,
  contexto text not null,
  urgencia text not null default 'normal' check (urgencia in ('baja', 'normal', 'alta')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'resuelta')),
  creado_en timestamptz not null default now(),
  resuelta_en timestamptz,
  unique (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade,
  foreign key (company_id, task_id) references public.tasks (company_id, id) on delete set null (task_id),
  -- El contexto puede contener datos del contacto: el borrado RGPD se lleva la tarea.
  foreign key (company_id, contact_id) references public.contacts (company_id, id) on delete cascade
);
create index human_tasks_company_idx on public.human_tasks (company_id, estado, creado_en desc);

-- 3) RLS ---------------------------------------------------------------------------------------------------------------------
alter table public.tool_calls enable row level security;
alter table public.human_tasks enable row level security;
create policy tool_calls_select on public.tool_calls for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy human_tasks_select on public.human_tasks for select to authenticated
  using (company_id = (select public.current_company_id()));
-- Cualquier miembro puede marcar una tarea como en curso o resuelta (solo esas columnas).
create policy human_tasks_update on public.human_tasks for update to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
revoke all on public.tool_calls, public.human_tasks from anon, authenticated;
grant select on public.tool_calls, public.human_tasks to authenticated;
grant update (estado, resuelta_en) on public.human_tasks to authenticated;
grant select, insert, update, delete on public.tool_calls, public.human_tasks to service_role;

-- 4) Traspaso a un agente concreto (pasar_a_agente) -----------------------------------------------------------------------
-- Solo si la empresa configuró ese traspaso (agent_handoffs, activo) entre esos dos agentes. Lo comprueba la base, no la IA.
create function public.agent_create_handoff_a_agente(
  p_company_id uuid, p_from_agent uuid, p_to_agent uuid, p_kind public.handoff_kind, p_summary text, p_card jsonb, p_contact_id uuid default null
) returns table (handoff_id uuid, to_agent_id uuid, to_agent_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.agents;
  v_to public.agents;
  v_id uuid;
begin
  select * into v_from from public.agents where company_id = p_company_id and id = p_from_agent;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  select * into v_to from public.agents where company_id = p_company_id and id = p_to_agent;
  if not found then raise exception 'Agente de destino no encontrado' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.agent_handoffs h
     where h.company_id = p_company_id and h.agent_id_origen = p_from_agent and h.agent_id_destino = p_to_agent and h.activo
  ) then
    raise exception 'TRASPASO_NO_CONFIGURADO: la empresa no ha configurado este traspaso' using errcode = '42501';
  end if;

  insert into public.handoffs (company_id, from_agent_id, to_agent_id, from_department_id, to_department_id, kind, summary, bubble, card, status, contact_id)
    values (p_company_id, v_from.id, v_to.id, v_from.department_id, v_to.department_id, p_kind, p_summary,
            v_to.name || ' recibió un traspaso de ' || v_from.name, coalesce(p_card, '[]'::jsonb), 'sent', p_contact_id)
    returning id into v_id;
  return query select v_id, v_to.id, v_to.name;
end;
$$;
revoke all on function public.agent_create_handoff_a_agente(uuid, uuid, uuid, public.handoff_kind, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.agent_create_handoff_a_agente(uuid, uuid, uuid, public.handoff_kind, text, jsonb, uuid) to service_role;
