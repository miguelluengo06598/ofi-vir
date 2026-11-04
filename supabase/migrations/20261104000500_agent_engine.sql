-- Fase 2 · Motor de agentes: instrucciones, tarifas en euros, registro de cada tarea y de cada paso.

-- Una tarea que supera el límite de pasos o de coste se para y queda para revisión.
alter type public.task_status add value if not exists 'review';

-- Instrucciones fijas del agente (se envían como mensaje de sistema y se cachean).
alter table public.agents add column instructions text not null default '';

-- Tarifas en euros por millón de tokens. VALORES DE EJEMPLO (tarifa en USD × 0,92): ajustar a la tarifa vigente y al cambio.
alter table public.model_pricing
  add column input_eur_per_mtok numeric(12, 6) not null default 0 check (input_eur_per_mtok >= 0),
  add column output_eur_per_mtok numeric(12, 6) not null default 0 check (output_eur_per_mtok >= 0),
  add column cache_read_eur_per_mtok numeric(12, 6) not null default 0 check (cache_read_eur_per_mtok >= 0),
  add column cache_write_eur_per_mtok numeric(12, 6) not null default 0 check (cache_write_eur_per_mtok >= 0);
update public.model_pricing set input_eur_per_mtok = 0.092, output_eur_per_mtok = 0.46, cache_read_eur_per_mtok = 0.0092, cache_write_eur_per_mtok = 0.115 where model = 'claude-haiku-5-5';
update public.model_pricing set input_eur_per_mtok = 1.84, output_eur_per_mtok = 9.2, cache_read_eur_per_mtok = 0.184, cache_write_eur_per_mtok = 2.3 where model = 'claude-sonnet-5-5';

-- Tokens de caché, coste en euros, pasos y motivo de revisión de cada tarea.
alter table public.tasks
  add column cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  add column cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  add column cost_eur numeric(12, 6) not null default 0,
  add column steps integer not null default 0,
  add column review_reason text,
  -- Contacto al que se refiere la tarea: al borrarlo (RGPD) se borra la tarea con todos sus pasos.
  add column contact_id uuid;
alter table public.tasks add foreign key (company_id, contact_id) references public.contacts (company_id, id) on delete cascade;
create index tasks_contact_idx on public.tasks (company_id, contact_id) where contact_id is not null;

-- El coste lo calcula la base con la tarifa del modelo: input_tokens es lo NO cacheado (como en la API de Claude).
create or replace function public.tasks_compute_cost()
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
  new.cost_eur := round(
    new.input_tokens / 1000000.0 * p.input_eur_per_mtok
    + new.output_tokens / 1000000.0 * p.output_eur_per_mtok
    + new.cache_read_tokens / 1000000.0 * p.cache_read_eur_per_mtok
    + new.cache_write_tokens / 1000000.0 * p.cache_write_eur_per_mtok,
    6
  );
  return new;
end;
$$;
drop trigger tasks_compute_cost on public.tasks;
create trigger tasks_compute_cost
  before insert or update of model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens on public.tasks
  for each row execute function public.tasks_compute_cost();

-- Paso a paso de una tarea: lo que se le pidió, lo que respondió el modelo y cada herramienta que usó.
create table public.task_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  task_id uuid not null,
  position integer not null,
  -- Llamada al modelo a la que pertenece (0 = la instrucción de entrada).
  step integer not null default 0,
  kind text not null check (kind in ('instruccion', 'respuesta', 'herramienta', 'fin')),
  content text not null default '',
  tool_name text,
  tool_input jsonb,
  is_error boolean not null default false,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cost_eur numeric(12, 6) not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, task_id, position),
  foreign key (company_id, task_id) references public.tasks (company_id, id) on delete cascade
);
alter table public.task_steps enable row level security;
grant select on public.task_steps to authenticated;
create policy task_steps_select on public.task_steps for select to authenticated
  using (company_id = (select public.current_company_id()));

-- El borrado de un contacto (RGPD) cuenta también las tareas ligadas a él y borra sus pasos en cascada.
create or replace function public.erase_contact(p_company_id uuid, p_contact_id uuid, p_requested_by text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_email text;
  v_node_ids uuid[];
  v_neighbors uuid[];
  v_approval_ids uuid[];
  v_threads integer;
  v_emails integer;
  v_tasks integer;
  v_edges integer;
  v_approvals integer := 0;
  v_orphans integer := 0;
  v_counts jsonb;
begin
  select lower(c.email) into v_email
    from public.contacts c
   where c.company_id = p_company_id and c.id = p_contact_id
     for update;
  if not found then
    raise exception 'Contacto no encontrado' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(n.id), '{}') into v_node_ids
    from public.memory_nodes n where n.company_id = p_company_id and n.contact_id = p_contact_id;

  select count(*) into v_edges
    from public.memory_edges e
   where e.company_id = p_company_id and (e.from_node_id = any (v_node_ids) or e.to_node_id = any (v_node_ids));

  -- Nodos sin contacto conectados a los que se van a borrar: candidatos a quedarse huérfanos.
  select coalesce(array_agg(distinct o.id), '{}') into v_neighbors
    from public.memory_edges e
    join public.memory_nodes o
      on o.company_id = e.company_id
     and o.id = case when e.from_node_id = any (v_node_ids) then e.to_node_id else e.from_node_id end
   where e.company_id = p_company_id
     and (e.from_node_id = any (v_node_ids) or e.to_node_id = any (v_node_ids))
     and o.contact_id is null;

  select count(*) into v_threads from public.email_threads t where t.company_id = p_company_id and t.contact_id = p_contact_id;
  select count(*) into v_emails
    from public.emails m join public.email_threads t on t.company_id = m.company_id and t.id = m.thread_id
   where t.company_id = p_company_id and t.contact_id = p_contact_id;

  -- Tareas de agente creadas por correos de este contacto (se borran en cascada con sus correos).
  select count(*) into v_tasks
    from public.tasks k
   where k.company_id = p_company_id
     and (k.contact_id = p_contact_id
          or k.source_email_id in (
            select m.id from public.emails m join public.email_threads t on t.company_id = m.company_id and t.id = m.thread_id
             where t.company_id = p_company_id and t.contact_id = p_contact_id));

  select coalesce(array_agg(distinct s.id), '{}') into v_approval_ids from (
    select m.approval_id as id
      from public.emails m join public.email_threads t on t.company_id = m.company_id and t.id = m.thread_id
     where t.company_id = p_company_id and t.contact_id = p_contact_id and m.approval_id is not null
    union
    select a.id from public.approvals a
     where a.company_id = p_company_id and a.kind = 'email' and lower(a.payload ->> 'to') = v_email
  ) s;

  delete from public.contacts where company_id = p_company_id and id = p_contact_id;

  delete from public.approvals where company_id = p_company_id and id = any (v_approval_ids);
  get diagnostics v_approvals = row_count;

  delete from public.memory_nodes n
   where n.company_id = p_company_id and n.id = any (v_neighbors)
     and not exists (
       select 1 from public.memory_edges e
        where e.company_id = n.company_id and (e.from_node_id = n.id or e.to_node_id = n.id)
     );
  get diagnostics v_orphans = row_count;

  v_counts := jsonb_build_object(
    'contactos', 1,
    'nodos', cardinality(v_node_ids),
    'conexiones', v_edges,
    'hilos', v_threads,
    'correos', v_emails,
    'tareas', v_tasks,
    'aprobaciones', v_approvals,
    'nodos_huerfanos', v_orphans
  );

  insert into public.erasure_log (company_id, contact_id, requested_by, counts)
  values (p_company_id, p_contact_id, p_requested_by, v_counts);

  return v_counts;
end;
$$;

