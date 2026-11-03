-- Fase 2 · Modelo de datos (3/6): aprobaciones, hilos y correos.

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid not null,
  kind public.approval_kind not null,
  title text not null,
  detail text,
  -- Lo que se aprueba, tal cual. Para kind = 'email': { to, subject, body, attachments }.
  payload jsonb not null default '{}'::jsonb,
  cost_credits numeric(10, 2),
  status public.approval_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  -- Huella (SHA-256) del asunto y el cuerpo aprobados; el correo enviado debe coincidir con ella.
  content_sha256 text,
  unique (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id),
  foreign key (company_id, decided_by) references public.users (company_id, id),
  check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null)
  )
);
create index approvals_status_idx on public.approvals (company_id, status);

-- Huella de un correo: asunto + salto de línea + cuerpo.
create function public.email_content_hash(subject text, body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(subject, '') || E'\n' || coalesce(body, ''), 'sha256'), 'hex')
$$;

create function public.approvals_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Toda aprobación nace pendiente; solo una persona (o el servicio, al decidirla) la resuelve.
    if new.status <> 'pending' then
      raise exception 'Una aprobación debe crearse como pendiente' using errcode = '23514';
    end if;
    return new;
  end if;

  -- Una decisión es definitiva: si el texto cambia tras aprobarse, hay que crear otra aprobación.
  if old.status <> 'pending' then
    raise exception 'La aprobación ya está resuelta; crea una nueva para cambiar algo' using errcode = '23514';
  end if;

  if new.status <> 'pending' then
    new.decided_by := coalesce(new.decided_by, auth.uid());
    new.decided_at := coalesce(new.decided_at, now());
    if new.status = 'approved' and new.kind = 'email' then
      new.content_sha256 := public.email_content_hash(new.payload ->> 'subject', new.payload ->> 'body');
    end if;
  end if;
  return new;
end;
$$;

create trigger approvals_guard
  before insert or update on public.approvals
  for each row execute function public.approvals_guard();

create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid not null,
  agent_id uuid not null,
  subject text not null,
  status public.email_thread_status not null default 'pending_approval',
  -- Aviso bajo el estado (p. ej. el motivo de un rebote).
  status_note text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, contact_id) references public.contacts (company_id, id) on delete cascade,
  foreign key (company_id, agent_id) references public.agents (company_id, id)
);
create index email_threads_contact_idx on public.email_threads (company_id, contact_id, last_message_at desc);
create index email_threads_agent_idx on public.email_threads (company_id, agent_id);

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  thread_id uuid not null,
  direction public.email_direction not null,
  from_address text not null,
  to_address text not null,
  subject text not null,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  delivery_status public.email_delivery_status not null default 'pending_approval',
  -- Aprobación que autoriza el envío (obligatoria en los salientes que ya no están pendientes).
  approval_id uuid,
  -- Id del mensaje en Resend.
  resend_message_id text,
  -- Cabeceras RFC 5322 para encadenar hilos.
  message_id_header text,
  in_reply_to text,
  references_headers text[] not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, thread_id) references public.email_threads (company_id, id) on delete cascade,
  foreign key (company_id, approval_id) references public.approvals (company_id, id),
  check ((direction = 'inbound') = (delivery_status = 'received'))
);
create unique index emails_resend_id_key on public.emails (resend_message_id) where resend_message_id is not null;
create unique index emails_message_id_key on public.emails (company_id, message_id_header) where message_id_header is not null;
create index emails_thread_idx on public.emails (company_id, thread_id, occurred_at);
create index emails_in_reply_to_idx on public.emails (company_id, in_reply_to) where in_reply_to is not null;

-- Ningún correo saliente sale sin una aprobación registrada, con el texto exacto aprobado y dentro del límite diario del agente.
create function public.emails_require_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ap public.approvals;
  v_agent public.agents;
  v_sent_today integer;
begin
  if new.direction <> 'outbound' or new.delivery_status = 'pending_approval' then
    return new;
  end if;

  select * into ap from public.approvals
   where id = new.approval_id and company_id = new.company_id;
  if not found or ap.status <> 'approved' or ap.kind <> 'email' then
    raise exception 'Correo saliente sin aprobación registrada' using errcode = '23514';
  end if;
  if ap.content_sha256 is distinct from public.email_content_hash(new.subject, new.body) then
    raise exception 'El texto del correo no coincide con el aprobado' using errcode = '23514';
  end if;

  -- Límite diario: solo cuenta al pasar de pendiente a enviado (los avisos de entrega posteriores no suman).
  if tg_op = 'INSERT' or old.delivery_status = 'pending_approval' then
    select a.* into v_agent
      from public.email_threads t
      join public.agents a on a.company_id = t.company_id and a.id = t.agent_id
     where t.company_id = new.company_id and t.id = new.thread_id;

    select count(*) into v_sent_today
      from public.emails e
      join public.email_threads t on t.company_id = e.company_id and t.id = e.thread_id
     where e.company_id = new.company_id
       and t.agent_id = v_agent.id
       and e.direction = 'outbound'
       and e.delivery_status <> 'pending_approval'
       and e.occurred_at >= date_trunc('day', now())
       and e.id <> new.id;

    if v_sent_today >= v_agent.daily_email_limit then
      raise exception 'El agente ha alcanzado su límite diario de correos (%)', v_agent.daily_email_limit using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger emails_require_approval
  before insert or update on public.emails
  for each row execute function public.emails_require_approval();
