-- Fase 2 · Modelo de datos (6/6): Row Level Security y permisos.
-- Cada empresa solo ve (y toca) lo suyo. Quien no es miembro de ninguna empresa (p. ej. un creador de agentes) no ve nada.
-- El servidor usa la clave service_role, que se salta la RLS: nunca debe llegar al navegador.

-- 1) Permisos de tabla: partir de cero y conceder lo mínimo. `anon` no tiene acceso a nada.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

grant select on
  public.companies, public.users, public.departments, public.agents, public.contacts,
  public.email_threads, public.emails, public.approvals,
  public.tasks, public.handoff_chains, public.handoffs,
  public.memory_nodes, public.memory_edges, public.model_pricing
to authenticated;

-- Lo que las personas pueden escribir desde la interfaz (el resto lo escribe el servidor con service_role).
grant update on public.companies to authenticated;
grant insert, update, delete on public.departments, public.agents to authenticated;
grant insert, update, delete on public.contacts, public.memory_nodes, public.memory_edges to authenticated;
grant update on public.approvals to authenticated;

-- 2) RLS activada en todas las tablas.
alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.departments enable row level security;
alter table public.agents enable row level security;
alter table public.contacts enable row level security;
alter table public.email_threads enable row level security;
alter table public.emails enable row level security;
alter table public.approvals enable row level security;
alter table public.tasks enable row level security;
alter table public.handoff_chains enable row level security;
alter table public.handoffs enable row level security;
alter table public.memory_nodes enable row level security;
alter table public.memory_edges enable row level security;
alter table public.model_pricing enable row level security;

-- 3) Lectura: solo filas de tu empresa.
create policy companies_select on public.companies for select to authenticated
  using (id = (select public.current_company_id()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'departments', 'agents', 'contacts', 'email_threads', 'emails', 'approvals',
    'tasks', 'handoff_chains', 'handoffs', 'memory_nodes', 'memory_edges'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (company_id = (select public.current_company_id()))',
      t || '_select', t
    );
  end loop;
end $$;

create policy model_pricing_select on public.model_pricing for select to authenticated using (true);

-- 4) Escritura.
-- Ajustes de la empresa, departamentos y agentes: propietarios y administradores.
create policy companies_update on public.companies for update to authenticated
  using (id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'))
  with check (id = (select public.current_company_id()));

create policy departments_write on public.departments for all to authenticated
  using (company_id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'))
  with check (company_id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'));

create policy agents_write on public.agents for all to authenticated
  using (company_id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'))
  with check (company_id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'));

-- Contactos y memoria: cualquier miembro (corregir y borrar desde la vista Memoria).
create policy contacts_write on public.contacts for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

create policy memory_nodes_write on public.memory_nodes for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

create policy memory_edges_write on public.memory_edges for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

-- Aprobaciones: un miembro decide (y puede editar el borrador mientras esté pendiente; el trigger las congela al decidir).
-- No hay política de insert: las aprobaciones las crea el servidor cuando un agente pide permiso.
create policy approvals_update on public.approvals for update to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

-- email_threads, emails, tasks, handoffs, handoff_chains, users: solo lectura para personas.
-- Los escribe el servidor (service_role), y aun así el trigger de emails exige aprobación registrada.
