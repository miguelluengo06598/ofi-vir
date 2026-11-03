-- Fase 2 · Modelo de datos (2/6): empresas, miembros, departamentos, agentes y contactos.
-- Cada tabla expone unique (company_id, id) para que las claves foráneas compuestas impidan
-- que una fila apunte a datos de OTRA empresa, incluso si alguien se salta la RLS.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Miembros de la empresa. Un usuario de Supabase Auth pertenece a una sola empresa.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.user_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, email)
);
create index users_company_idx on public.users (company_id);

-- Empresa del usuario autenticado. SECURITY DEFINER para poder leer public.users sin que su propia RLS entre en bucle.
-- Un usuario sin fila en public.users (p. ej. un creador de agentes) obtiene NULL y, por tanto, no ve ningún dato.
create function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.company_id from public.users u where u.id = auth.uid()
$$;

create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = auth.uid()
$$;

revoke all on function public.current_company_id() from public;
revoke all on function public.current_user_role() from public;
grant execute on function public.current_company_id() to authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, service_role;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, slug)
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  department_id uuid not null,
  slug text not null,
  name text not null,
  role text not null,
  -- Especialista externo que creó el agente. Es solo un nombre: los creadores no tienen acceso a datos de empresas.
  creator_name text not null,
  -- Modelo configurado para este agente (tareas simples: haiku; difíciles: sonnet).
  model text not null default 'claude-haiku-5-5' references public.model_pricing (model),
  daily_email_limit integer not null default 50 check (daily_email_limit >= 0),
  -- Herramientas que el agente puede usar (lista cerrada: lo que no está aquí, no puede usarlo).
  allowed_tools text[] not null default '{}',
  status public.agent_status not null default 'working',
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, slug),
  foreign key (company_id, department_id) references public.departments (company_id, id)
);
create index agents_department_idx on public.agents (company_id, department_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  email text not null,
  organization text,
  job_title text,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, email)
);
