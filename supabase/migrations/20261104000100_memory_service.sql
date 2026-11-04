-- Fase 2 · Servicio de memoria: constancia de borrados (RGPD, derecho de supresión) y borrado de un contacto.

-- Constancia de que se borró un contacto. NO guarda datos personales: solo el id (ya inexistente), cuándo,
-- quién lo pidió y cuántas filas se borraron de cada tipo. Sin clave foránea al contacto, para que sobreviva.
create table public.erasure_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null,
  requested_by text not null,
  erased_at timestamptz not null default now(),
  -- Solo recuentos: { contactos, nodos, conexiones, hilos, correos, aprobaciones, nodos_huerfanos }
  counts jsonb not null
);
create index erasure_log_company_idx on public.erasure_log (company_id, erased_at desc);

alter table public.erasure_log enable row level security;
grant select on public.erasure_log to authenticated;
create policy erasure_log_select on public.erasure_log for select to authenticated
  using (company_id = (select public.current_company_id()));
-- Nadie escribe desde el navegador: la constancia la crea solo erase_contact (servicio).

-- Borra un contacto y todo lo que depende solo de él, en una sola transacción:
--  · el contacto, sus hilos y correos, y sus nodos de memoria con sus conexiones (en cascada);
--  · las aprobaciones de correo dirigidas a él (su payload contiene su dirección y el texto);
--  · los nodos sin contacto que solo colgaban de sus nodos y se quedan sin conexiones.
-- Lo compartido (nodos de otros contactos, nodos de empresa aún conectados) se conserva.
create function public.erase_contact(p_company_id uuid, p_contact_id uuid, p_requested_by text)
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
    'aprobaciones', v_approvals,
    'nodos_huerfanos', v_orphans
  );

  insert into public.erasure_log (company_id, contact_id, requested_by, counts)
  values (p_company_id, p_contact_id, p_requested_by, v_counts);

  return v_counts;
end;
$$;

revoke all on function public.erase_contact(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.erase_contact(uuid, uuid, text) to service_role;
