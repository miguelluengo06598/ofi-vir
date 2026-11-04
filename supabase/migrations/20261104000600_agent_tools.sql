-- Herramientas de los agentes: crear un borrador con su aprobación y crear un traspaso, cada una en una sola transacción.
-- Solo las puede llamar el servidor (service_role). Un borrador NUNCA se envía desde aquí: nace «pendiente de aprobación».

create or replace function public.agent_create_email_draft(
  p_company_id uuid, p_agent_id uuid, p_contact_id uuid, p_subject text, p_body text
) returns table (approval_id uuid, email_id uuid, thread_id uuid, reused boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts;
  v_agent public.agents;
  v_thread uuid;
  v_approval uuid;
  v_email uuid;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  select * into v_contact from public.contacts where company_id = p_company_id and id = p_contact_id;
  if not found then raise exception 'Contacto no encontrado' using errcode = 'P0002'; end if;

  -- Mismo borrador pendiente (mismo agente, destinatario y texto): se devuelve el existente en vez de duplicarlo.
  select e.approval_id, e.id, e.thread_id into v_approval, v_email, v_thread
    from public.emails e
    join public.email_threads t on t.company_id = e.company_id and t.id = e.thread_id
    join public.approvals a on a.company_id = e.company_id and a.id = e.approval_id
   where e.company_id = p_company_id and t.agent_id = p_agent_id and t.contact_id = p_contact_id
     and e.direction = 'outbound' and e.delivery_status = 'pending_approval' and a.status = 'pending'
     and e.subject = p_subject and e.body = p_body
   limit 1;
  if found then
    return query select v_approval, v_email, v_thread, true;
    return;
  end if;

  insert into public.email_threads (company_id, contact_id, agent_id, subject, status)
    values (p_company_id, p_contact_id, p_agent_id, p_subject, 'pending_approval')
    returning id into v_thread;

  insert into public.approvals (company_id, agent_id, kind, title, detail, payload)
    values (p_company_id, p_agent_id, 'email', 'Enviar «' || p_subject || '»',
            'Para ' || v_contact.name || ' <' || v_contact.email || '> · redactado por ' || v_agent.name,
            jsonb_build_object('to', v_contact.email, 'to_name', v_contact.name, 'subject', p_subject, 'body', p_body, 'attachments', '[]'::jsonb, 'origen', 'motor'))
    returning id into v_approval;

  insert into public.emails (company_id, thread_id, direction, from_address, to_address, subject, body, delivery_status, approval_id)
    values (p_company_id, v_thread, 'outbound', '', v_contact.email, p_subject, p_body, 'pending_approval', v_approval)
    returning id into v_email;

  return query select v_approval, v_email, v_thread, false;
end;
$$;

create or replace function public.agent_create_handoff(
  p_company_id uuid, p_from_agent uuid, p_to_department uuid, p_kind public.handoff_kind, p_summary text, p_card jsonb
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
  -- Agente de destino: el primero del departamento que no esté en pausa ni en error (y no sea el propio).
  select * into v_to from public.agents
   where company_id = p_company_id and department_id = p_to_department and id <> p_from_agent and status in ('working', 'waiting')
   order by (status = 'working') desc, name limit 1;
  if not found then raise exception 'Ese departamento no tiene ningún agente disponible' using errcode = 'P0002'; end if;

  insert into public.handoffs (company_id, from_agent_id, to_agent_id, from_department_id, to_department_id, kind, summary, bubble, card, status)
    values (p_company_id, v_from.id, v_to.id, v_from.department_id, v_to.department_id, p_kind, p_summary,
            v_to.name || ' recibió un traspaso de ' || v_from.name, coalesce(p_card, '[]'::jsonb), 'sent')
    returning id into v_id;
  return query select v_id, v_to.id, v_to.name;
end;
$$;

revoke all on function public.agent_create_email_draft(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.agent_create_handoff(uuid, uuid, uuid, public.handoff_kind, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_create_email_draft(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.agent_create_handoff(uuid, uuid, uuid, public.handoff_kind, text, jsonb) to service_role;
grant select, insert, update on public.task_steps to service_role;
grant select, update on public.tasks to service_role;
