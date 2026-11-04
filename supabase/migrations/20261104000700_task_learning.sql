-- Aprendizaje al terminar cada tarea: un paso automático con Haiku guarda lo importante en la memoria.

-- Qué tarea originó cada recuerdo (para mostrar «Lucía ha recordado 3 cosas»). Si la tarea se borra, el recuerdo se conserva.
alter table public.memory_nodes add column source_task_id uuid;
alter table public.memory_nodes
  add foreign key (company_id, source_task_id) references public.tasks (company_id, id) on delete set null (source_task_id);
create index memory_nodes_source_task_idx on public.memory_nodes (company_id, source_task_id) where source_task_id is not null;

-- El paso de memoria aparece en el paso a paso de la tarea.
alter table public.task_steps drop constraint task_steps_kind_check;
alter table public.task_steps add constraint task_steps_kind_check check (kind in ('instruccion', 'respuesta', 'herramienta', 'memoria', 'fin'));

-- Coste del paso de memoria (modelo propio, Haiku): se suma al coste de la tarea.
alter table public.tasks
  add column memory_input_tokens bigint not null default 0 check (memory_input_tokens >= 0),
  add column memory_output_tokens bigint not null default 0 check (memory_output_tokens >= 0),
  add column extra_cost_eur numeric(12, 6) not null default 0 check (extra_cost_eur >= 0);

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
    + new.cache_write_tokens / 1000000.0 * p.cache_write_eur_per_mtok
    + new.extra_cost_eur,
    6
  );
  return new;
end;
$$;
drop trigger tasks_compute_cost on public.tasks;
create trigger tasks_compute_cost
  before insert or update of model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, extra_cost_eur on public.tasks
  for each row execute function public.tasks_compute_cost();
