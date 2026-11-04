-- Borrado RGPD completo: traspasos ligados al contacto y nodos sin contacto que vienen de sus tareas o nombran su correo.

alter table public.handoffs add column contact_id uuid;
alter table public.handoffs add foreign key (company_id, contact_id) references public.contacts (company_id, id) on delete cascade;
create index handoffs_contact_idx on public.handoffs (company_id, contact_id) where contact_id is not null;

-- El traspaso se liga al contacto de la tarea (si lo hay).
drop function public.agent_create_handoff(uuid, uuid, uuid, public.handoff_kind, text, jsonb);
create function public.agent_create_handoff(
  p_company_id uuid, p_from_agent uuid, p_to_department uuid, p_kind public.handoff_kind, p_summary text, p_card jsonb, p_contact_id uuid default null
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
  select * into v_to from public.agents
   where company_id = p_company_id and department_id = p_to_department and id <> p_from_agent and status in ('working', 'waiting')
   order by (status = 'working') desc, name limit 1;
  if not found then raise exception 'Ese departamento no tiene ningún agente disponible' using errcode = 'P0002'; end if;

  insert into public.handoffs (company_id, from_agent_id, to_agent_id, from_department_id, to_department_id, kind, summary, bubble, card, status, contact_id)
    values (p_company_id, v_from.id, v_to.id, v_from.department_id, v_to.department_id, p_kind, p_summary,
            v_to.name || ' recibió un traspaso de ' || v_from.name, coalesce(p_card, '[]'::jsonb), 'sent', p_contact_id)
    returning id into v_id;
  return query select v_id, v_to.id, v_to.name;
end;
$$;
revoke all on function public.agent_create_handoff(uuid, uuid, uuid, public.handoff_kind, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.agent_create_handoff(uuid, uuid, uuid, public.handoff_kind, text, jsonb, uuid) to service_role;

create or replace function public.erase_contact(p_company_id uuid, p_contact_id uuid, p_requested_by text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_email text;
  v_node_ids uuid[];
  v_task_ids uuid[];
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

  -- Tareas del contacto: las suyas y las nacidas de sus correos.
  select coalesce(array_agg(k.id), '{}') into v_task_ids
    from public.tasks k
   where k.company_id = p_company_id
     and (k.contact_id = p_contact_id
          or k.source_email_id in (
            select m.id from public.emails m join public.email_threads t on t.company_id = m.company_id and t.id = m.thread_id
             where t.company_id = p_company_id and t.contact_id = p_contact_id));

  -- Sus nodos, más los que los agentes guardaron SIN indicar el contacto: los de sus tareas y los que nombran su correo.
  select coalesce(array_agg(distinct n.id), '{}') into v_node_ids
    from public.memory_nodes n
   where n.company_id = p_company_id
     and (n.contact_id = p_contact_id
          or n.source_task_id = any (v_task_ids)
          or position(v_email in lower(n.title || ' ' || n.content)) > 0);

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

  v_tasks := cardinality(v_task_ids);

  select coalesce(array_agg(distinct s.id), '{}') into v_approval_ids from (
    select m.approval_id as id
      from public.emails m join public.email_threads t on t.company_id = m.company_id and t.id = m.thread_id
     where t.company_id = p_company_id and t.contact_id = p_contact_id and m.approval_id is not null
    union
    select a.id from public.approvals a
     where a.company_id = p_company_id and a.kind = 'email' and lower(a.payload ->> 'to') = v_email
  ) s;

  delete from public.contacts where company_id = p_company_id and id = p_contact_id;

  -- Nodos sin contacto que la fila del contacto no arrastra en cascada.
  delete from public.memory_nodes n where n.company_id = p_company_id and n.id = any (v_node_ids);

  -- Traspasos ligados al contacto (en cascada) y cualquiera que nombre su correo.
  delete from public.handoffs h where h.company_id = p_company_id and position(v_email in lower(h.summary || ' ' || h.card::text)) > 0;

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
