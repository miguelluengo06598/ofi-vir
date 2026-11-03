-- Fase 2 · Modelo de datos (4/6): tareas de los agentes y traspasos entre departamentos.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid not null,
  title text not null,
  status public.task_status not null default 'running',
  model text not null references public.model_pricing (model),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  -- Coste de la IA: lo calcula el trigger con la tarifa del modelo (créditos).
  ai_cost_credits numeric(12, 4) not null default 0,
  -- Tarifa del creador del agente (créditos).
  creator_fee_credits numeric(12, 4) not null default 0 check (creator_fee_credits >= 0),
  cost_credits numeric(12, 4) generated always as (ai_cost_credits + creator_fee_credits) stored,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id)
);
create index tasks_agent_idx on public.tasks (company_id, agent_id, started_at desc);
create index tasks_status_idx on public.tasks (company_id, status);

create function public.tasks_compute_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.model_pricing;
begin
  select * into p from public.model_pricing where model = new.model;
  new.ai_cost_credits := round(
    new.input_tokens / 1000000.0 * p.input_credits_per_mtok
    + new.output_tokens / 1000000.0 * p.output_credits_per_mtok,
    4
  );
  return new;
end;
$$;

create trigger tasks_compute_cost
  before insert or update of model, input_tokens, output_tokens on public.tasks
  for each row execute function public.tasks_compute_cost();

-- Cadena: secuencia de traspasos que persigue un objetivo.
create table public.handoff_chains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  goal text not null,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);

-- Traspaso: mensaje con formato fijo de un agente a otro (normalmente de otro departamento; la interfaz también admite uno interno).
create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  chain_id uuid,
  position integer not null default 0,
  from_agent_id uuid not null,
  to_agent_id uuid not null,
  from_department_id uuid not null,
  to_department_id uuid not null,
  kind public.handoff_kind not null,
  summary text not null,
  -- Texto de la burbuja que aparece en la tarjeta de destino.
  bubble text,
  -- Ficha con los datos que se pasan: [{ label, value }].
  card jsonb not null default '[]'::jsonb,
  status public.handoff_status not null default 'sent',
  credits numeric(10, 4) not null default 0 check (credits >= 0),
  -- Si es sensible, la aprobación que genera.
  approval_id uuid,
  occurred_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, chain_id) references public.handoff_chains (company_id, id) on delete cascade,
  foreign key (company_id, from_agent_id) references public.agents (company_id, id),
  foreign key (company_id, to_agent_id) references public.agents (company_id, id),
  foreign key (company_id, from_department_id) references public.departments (company_id, id),
  foreign key (company_id, to_department_id) references public.departments (company_id, id),
  foreign key (company_id, approval_id) references public.approvals (company_id, id)
);
create index handoffs_chain_idx on public.handoffs (company_id, chain_id, position);
