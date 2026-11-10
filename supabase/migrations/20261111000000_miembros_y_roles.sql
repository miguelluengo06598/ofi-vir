-- Miembros de empresa, invitaciones y roles de plataforma.
--  · Una persona puede pertenecer a VARIAS empresas (company_members), con rol propietario | admin | miembro y estado activo | invitado | desactivado.
--  · public.users queda como PERFIL de la persona (nombre y correo): ya no guarda empresa ni rol.
--  · El acceso a los datos de una empresa depende de ser miembro ACTIVO de esa empresa (es_miembro / tiene_rol), nunca de un company_id del cliente.
--  · Los roles de SAMGPLE viven aparte (platform_roles, antes «reviewers»): ser de SAMGPLE no da acceso a ninguna empresa por sí solo.

-- 1) Empresas ------------------------------------------------------------------------------------------------------------------
-- created_at ya existe (es el «creado_en» de la empresa). Se añaden sector y estado.
alter table public.companies
  add column sector text,
  add column estado text not null default 'activa' check (estado in ('activa', 'suspendida'));

-- 2) Miembros --------------------------------------------------------------------------------------------------------------------
create type public.empresa_rol as enum ('propietario', 'admin', 'miembro');
create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rol public.empresa_rol not null default 'miembro',
  estado text not null default 'activo' check (estado in ('activo', 'invitado', 'desactivado')),
  -- Un miembro puede aprobar o rechazar si se le da permiso (propietarios y administradores siempre pueden).
  puede_aprobar boolean not null default false,
  creado_en timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members (user_id) where estado = 'activo';
-- Un solo propietario por empresa (se cambia con propiedad_transferir).
create unique index company_members_un_propietario_idx on public.company_members (company_id) where rol = 'propietario' and estado <> 'desactivado';

-- Las personas actuales pasan a ser miembros de su empresa. El rol interno admin_idesie no es un rol de empresa: pasa a platform_roles.
insert into public.company_members (company_id, user_id, rol, estado, creado_en)
select u.company_id, u.id,
       case u.role::text when 'owner' then 'propietario' when 'admin' then 'admin' else 'miembro' end::public.empresa_rol,
       'activo', u.created_at
  from public.users u where u.role::text <> 'admin_idesie';

-- 3) Roles de plataforma (SAMGPLE) -------------------------------------------------------------------------------------------------
-- La tabla de revisores ya era esto (user_id, rol revisor_samgple | admin_samgple, más categorías y activo): se renombra, no se duplica.
alter table public.reviewers rename to platform_roles;
alter table public.platform_roles rename constraint reviewers_rol_check to platform_roles_rol_check;
insert into public.platform_roles (user_id, rol, nombre, categorias)
select u.id, 'admin_samgple', u.full_name, array['ventas', 'atencion', 'marketing', 'operaciones', 'direccion', 'personalizado']
  from public.users u where u.role::text = 'admin_idesie'
on conflict (user_id) do update set rol = 'admin_samgple', activo = true;
-- Nombre anterior, para el código y las funciones del panel de certificación (vista simple: se puede leer y escribir igual).
create view public.reviewers with (security_invoker = true) as select * from public.platform_roles;
revoke all on public.platform_roles, public.reviewers from public, anon, authenticated;
grant select, insert, update, delete on public.platform_roles, public.reviewers to service_role;
-- Cada persona puede ver su propio rol de plataforma (nada más).
create policy platform_roles_propio on public.platform_roles for select to authenticated using (user_id = (select auth.uid()));
grant select on public.platform_roles to authenticated;

-- 4) Funciones de acceso -----------------------------------------------------------------------------------------------------------
-- SECURITY DEFINER para leer company_members sin que su propia RLS entre en bucle. Siempre sobre auth.uid(): nunca un id del cliente.
-- Una empresa suspendida no da acceso a nadie desde el navegador.
create function public.es_miembro(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m join public.companies c on c.id = m.company_id
     where m.company_id = p_company_id and m.user_id = (select auth.uid()) and m.estado = 'activo' and c.estado = 'activa')
$$;
create function public.tiene_rol(p_company_id uuid, p_roles public.empresa_rol[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m join public.companies c on c.id = m.company_id
     where m.company_id = p_company_id and m.user_id = (select auth.uid()) and m.estado = 'activo' and c.estado = 'activa' and m.rol = any (p_roles))
$$;
create function public.puede_aprobar(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m join public.companies c on c.id = m.company_id
     where m.company_id = p_company_id and m.user_id = (select auth.uid()) and m.estado = 'activo' and c.estado = 'activa'
       and (m.rol in ('propietario', 'admin') or m.puede_aprobar))
$$;
-- ¿Comparte alguna empresa (activa) con la persona de la sesión? Para ver el nombre de los compañeros, nunca el de otras empresas.
create function public.comparte_empresa(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members yo join public.company_members otro on otro.company_id = yo.company_id
     where yo.user_id = (select auth.uid()) and yo.estado = 'activo' and otro.user_id = p_user_id and otro.estado in ('activo', 'invitado'))
$$;
revoke all on function public.es_miembro(uuid), public.tiene_rol(uuid, public.empresa_rol[]), public.puede_aprobar(uuid), public.comparte_empresa(uuid) from public, anon;
grant execute on function public.es_miembro(uuid), public.tiene_rol(uuid, public.empresa_rol[]), public.puede_aprobar(uuid), public.comparte_empresa(uuid) to authenticated, service_role;

-- 5) Políticas RLS: todas las que dependían de la empresa de la sesión pasan a «ser miembro activo» (o propietario/admin para gestionar).
--    Las 7 que no dependen de la empresa (packs, tarifas, libro de solo inserción, tipo de nodo) no cambian.
--    Cambio de criterio: contactos y memoria ya no los escribe cualquier miembro desde el navegador, solo propietarios y administradores.
drop policy agent_corrections_select on public.agent_corrections;
create policy agent_corrections_select on public.agent_corrections for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agent_followups_select on public.agent_followups;
create policy agent_followups_select on public.agent_followups for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agent_handoffs_select on public.agent_handoffs;
create policy agent_handoffs_select on public.agent_handoffs for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agent_handoffs_write on public.agent_handoffs;
create policy agent_handoffs_write on public.agent_handoffs for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy agent_knowledge_select on public.agent_knowledge;
create policy agent_knowledge_select on public.agent_knowledge for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agent_routines_select on public.agent_routines;
create policy agent_routines_select on public.agent_routines for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agent_routines_write on public.agent_routines;
create policy agent_routines_write on public.agent_routines for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy agent_rules_select on public.agent_rules;
create policy agent_rules_select on public.agent_rules for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agent_rules_write on public.agent_rules;
create policy agent_rules_write on public.agent_rules for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy agent_setup_sessions_select on public.agent_setup_sessions;
create policy agent_setup_sessions_select on public.agent_setup_sessions for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agent_test_cases_select on public.agent_test_cases;
create policy agent_test_cases_select on public.agent_test_cases for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agent_test_cases_write on public.agent_test_cases;
create policy agent_test_cases_write on public.agent_test_cases for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy agent_tools_select on public.agent_tools;
create policy agent_tools_select on public.agent_tools for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agent_tools_write on public.agent_tools;
create policy agent_tools_write on public.agent_tools for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy agent_versions_select on public.agent_versions;
create policy agent_versions_select on public.agent_versions for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agents_select on public.agents;
create policy agents_select on public.agents for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy agents_write on public.agents;
create policy agents_write on public.agents for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy approvals_select on public.approvals;
create policy approvals_select on public.approvals for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy approvals_update on public.approvals;
create policy approvals_update on public.approvals for update to authenticated
  using ((select public.puede_aprobar(company_id)))
  with check ((select public.puede_aprobar(company_id)));
drop policy certification_requests_select on public.certification_requests;
create policy certification_requests_select on public.certification_requests for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy certifications_select on public.certifications;
create policy certifications_select on public.certifications for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using ((select public.es_miembro(id)));
drop policy companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using ((select public.tiene_rol(id, '{propietario,admin}')))
  with check ((select public.es_miembro(id)));
drop policy company_connections_select on public.company_connections;
create policy company_connections_select on public.company_connections for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy company_credit_settings_select on public.company_credit_settings;
create policy company_credit_settings_select on public.company_credit_settings for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy contacts_write on public.contacts;
create policy contacts_write on public.contacts for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy credit_ledger_select on public.credit_ledger;
create policy credit_ledger_select on public.credit_ledger for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy credit_lots_select on public.credit_lots;
create policy credit_lots_select on public.credit_lots for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy credit_reservations_select on public.credit_reservations;
create policy credit_reservations_select on public.credit_reservations for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy departments_select on public.departments;
create policy departments_select on public.departments for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy departments_write on public.departments;
create policy departments_write on public.departments for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy email_threads_select on public.email_threads;
create policy email_threads_select on public.email_threads for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy emails_select on public.emails;
create policy emails_select on public.emails for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy erasure_log_select on public.erasure_log;
create policy erasure_log_select on public.erasure_log for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy eventos_externos_select on public.eventos_externos;
create policy eventos_externos_select on public.eventos_externos for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy handoff_chains_select on public.handoff_chains;
create policy handoff_chains_select on public.handoff_chains for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy handoffs_select on public.handoffs;
create policy handoffs_select on public.handoffs for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy human_tasks_select on public.human_tasks;
create policy human_tasks_select on public.human_tasks for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy human_tasks_update on public.human_tasks;
create policy human_tasks_update on public.human_tasks for update to authenticated
  using ((select public.es_miembro(company_id)))
  with check ((select public.es_miembro(company_id)));
drop policy memory_edges_select on public.memory_edges;
create policy memory_edges_select on public.memory_edges for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy memory_edges_write on public.memory_edges;
create policy memory_edges_write on public.memory_edges for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy memory_nodes_select on public.memory_nodes;
create policy memory_nodes_select on public.memory_nodes for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy memory_nodes_write on public.memory_nodes;
create policy memory_nodes_write on public.memory_nodes for all to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')))
  with check ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy purchases_select on public.purchases;
create policy purchases_select on public.purchases for select to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')));
drop policy tareas_bloqueadas_select on public.tareas_bloqueadas;
create policy tareas_bloqueadas_select on public.tareas_bloqueadas for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy task_steps_select on public.task_steps;
create policy task_steps_select on public.task_steps for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy tool_calls_select on public.tool_calls;
create policy tool_calls_select on public.tool_calls for select to authenticated
  using ((select public.es_miembro(company_id)));
drop policy users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or (select public.comparte_empresa(id)));

-- 6) Vistas y funciones que leían la empresa de la sesión ---------------------------------------------------------------------------
create or replace view public.certification_exams_empresa with (security_barrier = true) as
select id, request_id, company_id, agent_id, agent_version, resultado, nota_global, bloques, informe, creado_en
  from public.certification_exams
 where (select public.es_miembro(company_id));
create or replace view public.certification_reviews_empresa with (security_barrier = true) as
select r.id, r.request_id, q.company_id, q.agent_id, q.agent_version, r.decision, r.comentario_para_empresa, r.creado_en
  from public.certification_reviews r
  join public.certification_requests q on q.id = r.request_id
 where (select public.es_miembro(q.company_id))
   and (q.estado in ('aprobada', 'rechazada') or r.decision = 'pedir_cambios');

create or replace function public._herramienta_permitida(p_agent_id uuid, p_tool_id text, p_permiso text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_template text;
  v_item jsonb;
begin
  -- Solo para agentes de una empresa de la que la persona es propietaria o administradora (quien puede editar herramientas).
  select a.template_id into v_template from public.agents a
   where a.id = p_agent_id and (auth.uid() is null or public.tiene_rol(a.company_id, '{propietario,admin}'));
  if not found then return false; end if;
  if v_template is null then return true; end if;
  select e into v_item from public.agent_templates t, jsonb_array_elements(t.herramientas_disponibles) e
   where t.id = v_template and e ->> 'id' = p_tool_id;
  if v_item is null then return false; end if;
  return coalesce((v_item ->> 'editable')::boolean, false) or v_item ->> 'permiso_defecto' = p_permiso;
end;
$$;

-- Aprobar un correo: quien aprueba debe ser miembro activo con permiso de aprobar.
create or replace function public.approve_email_draft(p_company_id uuid, p_approval_id uuid, p_user_id uuid, p_subject text, p_body text)
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

  perform 1 from public.company_members m
   where m.company_id = p_company_id and m.user_id = p_user_id and m.estado = 'activo' and (m.rol in ('propietario', 'admin') or m.puede_aprobar);
  if not found then
    raise exception 'Quien aprueba no pertenece a la empresa o no tiene permiso para aprobar' using errcode = '23514';
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

-- Resolver un seguimiento: quien tenga permiso de aprobar en esa empresa.
create or replace function public.seguimiento_resolver(p_company_id uuid, p_seguimiento_id uuid, p_user_id uuid, p_aprobar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seg public.agent_followups;
  v_agent public.agents;
  v_task uuid;
begin
  if not exists (select 1 from public.company_members m where m.company_id = p_company_id and m.user_id = p_user_id and m.estado = 'activo'
                  and (m.rol in ('propietario', 'admin') or m.puede_aprobar)) then
    raise exception 'SIN_PERMISO: solo propietarios, administradores o miembros con permiso de aprobar resuelven seguimientos' using errcode = '42501';
  end if;
  select * into v_seg from public.agent_followups where company_id = p_company_id and id = p_seguimiento_id for update;
  if not found then raise exception 'Seguimiento no encontrado' using errcode = 'P0002'; end if;
  if v_seg.estado <> 'propuesto' then
    return jsonb_build_object('resultado', 'ya_resuelto', 'estado', v_seg.estado, 'task_id', v_seg.task_id);
  end if;
  update public.approvals set status = case when p_aprobar then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
         decided_by = p_user_id, decided_at = now()
   where company_id = p_company_id and id = v_seg.approval_id and status = 'pending';
  if not p_aprobar then
    update public.agent_followups set estado = 'rechazado', aprobado_por = null, decidido_en = now() where id = v_seg.id;
    return jsonb_build_object('resultado', 'rechazado');
  end if;
  update public.agent_followups set estado = 'aprobado', aprobado_por = p_user_id, decidido_en = now() where id = v_seg.id;
  select * into v_agent from public.agents where company_id = p_company_id and id = v_seg.agent_id;
  insert into public.tasks (company_id, agent_id, title, model, status, contact_id, origen, seguimiento_id, aplazada_hasta, instruccion_aplazada)
  values (p_company_id, v_seg.agent_id, left('Seguimiento: ' || v_seg.motivo, 200), v_agent.model, 'scheduled', v_seg.contact_id, 'seguimiento_aprobado', v_seg.id,
          greatest(v_seg.fecha_prevista, now()),
          format(E'Seguimiento aprobado por una persona de la empresa.\nMotivo: %s\nMensaje previsto (revísalo con lo que sepas ahora; si ya no tiene sentido, no lo hagas y explícalo): %s',
                 v_seg.motivo, v_seg.mensaje_previsto))
  returning id into v_task;
  update public.agent_followups set task_id = v_task where id = v_seg.id;
  return jsonb_build_object('resultado', 'aprobado', 'task_id', v_task);
end;
$$;

-- 7) Las claves foráneas «persona de esta empresa» apuntan ahora a company_members (antes a users(company_id, id)) ----------------
do $$
declare
  r record;
  v_def text;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabla, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
     where c.contype = 'f' and c.confrelid = 'public.users'::regclass and array_length(c.conkey, 1) = 2
  loop
    v_def := regexp_replace(r.def, 'REFERENCES (public\.)?users\(company_id, id\)', 'REFERENCES public.company_members(company_id, user_id)');
    if v_def = r.def then raise exception 'Clave foránea inesperada en %: %', r.tabla, r.def; end if;
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
    execute format('alter table %s add constraint %I %s', r.tabla, r.conname, v_def);
  end loop;
end $$;

-- 8) public.users queda como perfil: sin empresa ni rol -------------------------------------------------------------------------
drop function public.current_company_id();
drop function public.current_user_role();
alter table public.users drop column company_id, drop column role;
drop type public.user_role;
comment on table public.users is 'Perfil de la persona (nombre y correo). La empresa y el rol están en company_members; los roles de SAMGPLE, en platform_roles.';
-- Ninguna función debe seguir leyendo la empresa de la sesión a la antigua.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
              and (p.prosrc like '%current_company_id%' or p.prosrc like '%current_user_role%' or p.prosrc ~ 'users u where u\.company_id')) then
    raise exception 'Queda alguna función que usa el modelo antiguo de usuarios';
  end if;
end $$;

-- 9) RLS de las tablas nuevas -----------------------------------------------------------------------------------------------------
alter table public.company_members enable row level security;
-- Cada persona ve sus propias pertenencias y los miembros de las empresas donde es miembro activo. Escribir: solo el servidor.
create policy company_members_select on public.company_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.es_miembro(company_id)));
revoke all on public.company_members from anon;
grant select on public.company_members to authenticated;
grant select, insert, update, delete on public.company_members to service_role;

-- 10) Invitaciones ------------------------------------------------------------------------------------------------------------------
-- El token se entrega UNA vez (en el enlace) y en la base solo se guarda su huella SHA-256: quien lea la tabla no puede usarlo.
create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  rol public.empresa_rol not null check (rol <> 'propietario'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invitado_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  caduca_en timestamptz not null default now() + interval '7 days',
  aceptada_en timestamptz,
  aceptada_por uuid references auth.users (id),
  revocada_en timestamptz,
  check ((aceptada_en is null) = (aceptada_por is null))
);
create unique index company_invitations_pendiente_idx on public.company_invitations (company_id, email) where aceptada_en is null and revocada_en is null;
alter table public.company_invitations enable row level security;
create policy company_invitations_select on public.company_invitations for select to authenticated
  using ((select public.tiene_rol(company_id, '{propietario,admin}')));
revoke all on public.company_invitations from anon, authenticated;
grant select (id, company_id, email, rol, invitado_por, creado_en, caduca_en, aceptada_en, aceptada_por, revocada_en) on public.company_invitations to authenticated;
grant select, insert, update, delete on public.company_invitations to service_role;

-- Crear una invitación: solo propietario o admin activos; nunca para propietario (eso es transferir la propiedad).
create function public.invitacion_crear(p_company_id uuid, p_actor uuid, p_email text, p_rol public.empresa_rol, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.company_members m where m.company_id = p_company_id and m.user_id = p_actor and m.estado = 'activo' and m.rol in ('propietario', 'admin')) then
    raise exception 'SIN_PERMISO: solo propietarios y administradores invitan' using errcode = '42501';
  end if;
  if p_rol = 'propietario' then raise exception 'ROL_NO_PERMITIDO: no se invita como propietario' using errcode = '42501'; end if;
  if exists (select 1 from public.company_members m join auth.users u on u.id = m.user_id
              where m.company_id = p_company_id and lower(u.email) = lower(btrim(p_email)) and m.estado = 'activo') then
    raise exception 'YA_ES_MIEMBRO: esa persona ya es miembro' using errcode = '23505';
  end if;
  -- Una invitación pendiente anterior al mismo correo se revoca (la nueva la sustituye).
  update public.company_invitations set revocada_en = now()
   where company_id = p_company_id and email = lower(btrim(p_email)) and aceptada_en is null and revocada_en is null;
  insert into public.company_invitations (company_id, email, rol, token_hash, invitado_por)
  values (p_company_id, lower(btrim(p_email)), p_rol, p_token_hash, p_actor) returning id into v_id;
  return v_id;
end;
$$;

-- Aceptar: de un solo uso, sin caducar ni revocar, y solo la persona cuyo correo es el invitado.
create function public.invitacion_aceptar(p_token_hash text, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.company_invitations;
  v_email text;
begin
  select * into v_inv from public.company_invitations where token_hash = p_token_hash for update;
  if not found or v_inv.revocada_en is not null or v_inv.aceptada_en is not null or v_inv.caduca_en < now() then
    raise exception 'INVITACION_NO_VALIDA: la invitación no existe, ya se usó, se revocó o caducó' using errcode = '22023';
  end if;
  select lower(email) into v_email from auth.users where id = p_user_id;
  if v_email is distinct from v_inv.email then
    raise exception 'INVITACION_DE_OTRA_PERSONA: la invitación es para otro correo' using errcode = '42501';
  end if;
  insert into public.users (id, full_name, email) values (p_user_id, split_part(v_email, '@', 1), v_email) on conflict (id) do nothing;
  insert into public.company_members (company_id, user_id, rol, estado) values (v_inv.company_id, p_user_id, v_inv.rol, 'activo')
  on conflict (company_id, user_id) do update set rol = excluded.rol, estado = 'activo'
    where public.company_members.rol <> 'propietario';
  update public.company_invitations set aceptada_en = now(), aceptada_por = p_user_id where id = v_inv.id;
  return v_inv.company_id;
end;
$$;

-- Cambiar rol, estado o permiso de aprobar de un miembro. Propietario y admin; un admin no toca al propietario ni nombra propietarios.
create function public.miembro_actualizar(p_company_id uuid, p_actor uuid, p_user_id uuid, p_rol public.empresa_rol, p_estado text, p_puede_aprobar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.empresa_rol;
  v_obj public.company_members;
begin
  select rol into v_actor from public.company_members where company_id = p_company_id and user_id = p_actor and estado = 'activo';
  if v_actor is null or v_actor = 'miembro' then raise exception 'SIN_PERMISO: solo propietarios y administradores gestionan miembros' using errcode = '42501'; end if;
  select * into v_obj from public.company_members where company_id = p_company_id and user_id = p_user_id for update;
  if not found then raise exception 'Miembro no encontrado' using errcode = 'P0002'; end if;
  if v_obj.rol = 'propietario' then raise exception 'PROPIETARIO_PROTEGIDO: el propietario solo cambia transfiriendo la propiedad' using errcode = '42501'; end if;
  if p_rol = 'propietario' then raise exception 'ROL_NO_PERMITIDO: para nombrar propietario hay que transferir la propiedad' using errcode = '42501'; end if;
  if p_estado is not null and p_estado not in ('activo', 'desactivado') then raise exception 'Estado no válido' using errcode = '22023'; end if;
  update public.company_members
     set rol = coalesce(p_rol, rol), estado = coalesce(p_estado, estado), puede_aprobar = coalesce(p_puede_aprobar, puede_aprobar)
   where company_id = p_company_id and user_id = p_user_id;
end;
$$;

-- Transferir la propiedad: solo el propietario, a un miembro activo. El anterior pasa a admin.
create function public.propiedad_transferir(p_company_id uuid, p_actor uuid, p_nuevo uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.company_members where company_id = p_company_id and user_id = p_actor and estado = 'activo' and rol = 'propietario') then
    raise exception 'SIN_PERMISO: solo el propietario transfiere la propiedad' using errcode = '42501';
  end if;
  if not exists (select 1 from public.company_members where company_id = p_company_id and user_id = p_nuevo and estado = 'activo') or p_nuevo = p_actor then
    raise exception 'El nuevo propietario debe ser otro miembro activo' using errcode = '22023';
  end if;
  update public.company_members set rol = 'admin' where company_id = p_company_id and user_id = p_actor;
  update public.company_members set rol = 'propietario' where company_id = p_company_id and user_id = p_nuevo;
end;
$$;
revoke all on function public.invitacion_crear(uuid, uuid, text, public.empresa_rol, text), public.invitacion_aceptar(text, uuid),
  public.miembro_actualizar(uuid, uuid, uuid, public.empresa_rol, text, boolean), public.propiedad_transferir(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.invitacion_crear(uuid, uuid, text, public.empresa_rol, text), public.invitacion_aceptar(text, uuid),
  public.miembro_actualizar(uuid, uuid, uuid, public.empresa_rol, text, boolean), public.propiedad_transferir(uuid, uuid, uuid) to service_role;
