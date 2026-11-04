-- Fase 2 · Envío de correo con Resend.

-- Un destinatario puede marcar el correo como spam: Resend lo avisa por webhook.
alter type public.email_delivery_status add value if not exists 'complained';
alter type public.email_thread_status add value if not exists 'complained';

-- Correos que un agente ha enviado hoy (mismo criterio que el límite diario del disparador emails_require_approval).
create function public.agent_emails_sent_today(p_company_id uuid, p_agent_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.emails e
    join public.email_threads t on t.company_id = e.company_id and t.id = e.thread_id
   where e.company_id = p_company_id
     and t.agent_id = p_agent_id
     and e.direction = 'outbound'
     and e.delivery_status <> 'pending_approval'
     and e.occurred_at >= date_trunc('day', now())
$$;

-- Aprueba un borrador de correo con el texto exacto que se ve en pantalla (asunto y cuerpo, quizá editados),
-- todo en una transacción: el texto del borrador, el de la aprobación y su huella quedan iguales.
-- Solo vale mientras la aprobación está pendiente; una decisión ya tomada no se reescribe.
create function public.approve_email_draft(
  p_company_id uuid, p_approval_id uuid, p_user_id uuid, p_subject text, p_body text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.approvals a
   where a.company_id = p_company_id and a.id = p_approval_id and a.kind = 'email' and a.status = 'pending'
     for update;
  if not found then
    raise exception 'La aprobación no existe o ya está resuelta' using errcode = '23514';
  end if;

  perform 1 from public.users u where u.company_id = p_company_id and u.id = p_user_id;
  if not found then
    raise exception 'Quien aprueba no pertenece a la empresa' using errcode = '23514';
  end if;

  update public.emails e
     set subject = p_subject, body = p_body
   where e.company_id = p_company_id and e.approval_id = p_approval_id
     and e.direction = 'outbound' and e.delivery_status = 'pending_approval';
  if not found then
    raise exception 'No hay un borrador pendiente para esta aprobación' using errcode = '23514';
  end if;

  update public.approvals a
     set payload = a.payload || jsonb_build_object('subject', p_subject, 'body', p_body),
         status = 'approved',
         decided_by = p_user_id
   where a.company_id = p_company_id and a.id = p_approval_id;
end;
$$;

revoke all on function public.agent_emails_sent_today(uuid, uuid) from public, anon, authenticated;
revoke all on function public.approve_email_draft(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.agent_emails_sent_today(uuid, uuid) to service_role;
grant execute on function public.approve_email_draft(uuid, uuid, uuid, text, text) to service_role;
