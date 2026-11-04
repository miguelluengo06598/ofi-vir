-- Fase 2 · Recepción de correo.

-- Momento en que el sistema recibió el correo por el webhook (solo correos entrantes recibidos en vivo).
alter table public.emails add column ingested_at timestamptz;

-- Contenido que viene de fuera (p. ej. un correo recibido): es DATO no fiable, nunca instrucción para un agente.
alter table public.memory_nodes add column external boolean not null default false;

-- Tarea creada por un correo recibido: el agente lo lee y propone el siguiente paso. Una tarea por correo.
alter table public.tasks add column source_email_id uuid;
alter table public.tasks add foreign key (company_id, source_email_id) references public.emails (company_id, id) on delete cascade;
create unique index tasks_source_email_key on public.tasks (company_id, source_email_id) where source_email_id is not null;

-- El borrado de un contacto (RGPD) cuenta también las tareas que nacieron de sus correos.
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
    join public.emails m on m.company_id = k.company_id and m.id = k.source_email_id
    join public.email_threads t on t.company_id = m.company_id and t.id = m.thread_id
   where t.company_id = p_company_id and t.contact_id = p_contact_id;

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

