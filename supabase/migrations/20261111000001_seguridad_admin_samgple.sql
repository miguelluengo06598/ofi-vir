-- Seguridad del panel interno de SAMGPLE: roles acumulables, auditoría inmutable y vistas de gestión.

-- Una persona conserva una fila de perfil de plataforma (las claves foráneas de certificación siguen siendo válidas),
-- pero puede acumular permisos en roles. rol queda como rol principal de compatibilidad.
alter table public.platform_roles
  add column roles text[] not null default '{}';

update public.platform_roles set roles = array[rol] where cardinality(roles) = 0;
alter table public.platform_roles
  add constraint platform_roles_roles_validos check (
    roles <@ array['admin_samgple','comercial_samgple','implantacion_samgple','revisor_samgple','soporte_samgple','finanzas_samgple']::text[]
    and cardinality(roles) > 0
  ),
  drop constraint platform_roles_rol_check,
  add constraint platform_roles_rol_check check (rol in ('admin_samgple','comercial_samgple','implantacion_samgple','revisor_samgple','soporte_samgple','finanzas_samgple'));

-- Admin implica acceso a todas las áreas; se añade al conjunto para que las consultas sean explícitas.
create or replace function public.platform_roles_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  if 'admin_samgple' = any(new.roles) then
    new.rol := 'admin_samgple';
  elsif new.rol <> any(new.roles) then
    new.rol := new.roles[1];
  end if;
  return new;
end $$;
create trigger platform_roles_normalizar before insert or update of rol, roles on public.platform_roles
  for each row execute function public.platform_roles_normalizar();

-- Registro de auditoría: solamente el servidor puede insertar y una vez insertado no cambia.
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  creado_en timestamptz not null default now(),
  ip inet,
  accion text not null check (length(trim(accion)) between 3 and 120),
  company_id uuid references public.companies(id) on delete set null,
  objeto_tipo text,
  objeto_id text,
  antes jsonb,
  despues jsonb,
  motivo text,
  check (motivo is null or length(trim(motivo)) between 1 and 4000)
);
create index admin_audit_log_actor_idx on public.admin_audit_log(actor_id, creado_en desc);
create index admin_audit_log_company_idx on public.admin_audit_log(company_id, creado_en desc) where company_id is not null;
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public, anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;
create trigger admin_audit_log_solo_insercion before update or delete on public.admin_audit_log
  for each row execute function public.solo_insercion();

-- La capa interna consulta únicamente este resumen cuando necesita una empresa: nunca contactos,
-- mensajes, cuerpos de correo, nodos de memoria, documentos ni conversaciones.
create view public.admin_companies_summary with (security_invoker = true, security_barrier = true) as
select c.id, c.name, c.sector, c.estado, c.created_at,
       count(distinct a.id) as agentes,
       count(distinct d.id) as departamentos
  from public.companies c
  left join public.agents a on a.company_id = c.id
  left join public.departments d on d.company_id = c.id
 group by c.id, c.name, c.sector, c.estado, c.created_at;
revoke all on public.admin_companies_summary from public, anon, authenticated;
grant select on public.admin_companies_summary to service_role;

comment on table public.admin_audit_log is 'Auditoría de acciones administrativas de SAMGPLE. Solo inserción; no almacena contenido de clientes.';
comment on view public.admin_companies_summary is 'Metadatos y agregados para SAMGPLE; nunca contenido de clientes.';
