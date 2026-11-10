-- La oficina de SAMGPLE (/admin): solicitudes de acceso, demos, implantaciones, soporte y avisos internos. Los roles acumulables
-- (platform_roles.roles) y la auditoría (admin_audit_log) los define 20261111000001_seguridad_admin_samgple.sql. Todo es de la plataforma: ninguna tabla da acceso a datos de las empresas (correos, contactos, memoria,
-- tareas). Solo service_role lee y escribe; el navegador nunca accede directamente (los paneles consultan desde el servidor).

-- 1) Solicitudes de acceso (formulario público /solicitar-acceso) -----------------------------------------------------------------
-- Datos de la persona interesada: SAMGPLE es responsable (ver /privacidad). Las comunicaciones comerciales solo con consentimiento.
create table public.solicitudes_acceso (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email like '%@%'),
  empresa text check (char_length(empresa) <= 160),
  telefono text check (char_length(telefono) <= 40),
  sector text check (char_length(sector) <= 80),
  tamano text check (tamano in ('1-4', '5-20', '21-50', '51+')),
  mensaje text check (char_length(mensaje) <= 2000),
  acepta_comunicaciones boolean not null default false,
  estado text not null default 'nueva' check (estado in ('nueva', 'contactada', 'demo', 'convertida', 'descartada')),
  asignada_a uuid references auth.users (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  origen text not null default 'web' check (origen in ('web', 'manual')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index solicitudes_acceso_estado_idx on public.solicitudes_acceso (estado, creado_en desc);

create table public.demos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_acceso (id) on delete cascade,
  fecha timestamptz not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'cancelada')),
  responsable uuid references auth.users (id) on delete set null,
  notas text check (char_length(notas) <= 1000),
  creado_en timestamptz not null default now()
);
create index demos_pendientes_idx on public.demos (fecha) where estado = 'pendiente';

-- 2) Implantación: puesta en marcha de cada cliente --------------------------------------------------------------------------------
create table public.implantaciones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'pausada', 'completada')),
  responsable uuid references auth.users (id) on delete set null,
  inicio date not null default current_date,
  objetivo_fin date,
  creado_en timestamptz not null default now(),
  unique (company_id)
);
create table public.implantacion_tareas (
  id uuid primary key default gen_random_uuid(),
  implantacion_id uuid not null references public.implantaciones (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 200),
  orden integer not null default 0,
  vence_en date,
  hecha_en timestamptz
);
create index implantacion_tareas_pendientes_idx on public.implantacion_tareas (vence_en) where hecha_en is null;

-- 3) Soporte: consultas de las empresas a SAMGPLE (solo el asunto y su estado; nunca datos de sus clientes) -------------------------
create table public.soporte_consultas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  asunto text not null check (char_length(asunto) between 1 and 200),
  estado text not null default 'abierta' check (estado in ('abierta', 'en_curso', 'escalada', 'resuelta')),
  prioridad text not null default 'normal' check (prioridad in ('baja', 'normal', 'alta', 'urgente')),
  asignada_a uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  resuelta_en timestamptz
);
create index soporte_consultas_abiertas_idx on public.soporte_consultas (estado, creado_en desc) where estado <> 'resuelta';

-- 4) Avisos internos: los de márgenes y recargas, más nueva solicitud, certificación atrasada y error del sistema -----------------
alter table public.internal_alerts drop constraint internal_alerts_tipo_check;
alter table public.internal_alerts add constraint internal_alerts_tipo_check
  check (tipo in ('margen_superado', 'limite_pasos', 'recarga_fallida', 'nueva_solicitud', 'certificacion_atrasada', 'error_sistema'));
alter table public.internal_alerts alter column company_id drop not null;
alter table public.internal_alerts add column leida_en timestamptz;
create index internal_alerts_sin_leer_idx on public.internal_alerts (creado_en desc) where leida_en is null;

create function public._solicitud_avisar() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.internal_alerts (tipo, company_id, detalle)
  values ('nueva_solicitud', null, jsonb_build_object('solicitud_id', new.id, 'empresa', coalesce(new.empresa, new.nombre)));
  return new;
end $$;
create trigger solicitudes_acceso_avisar after insert on public.solicitudes_acceso
  for each row execute function public._solicitud_avisar();

-- 5) Seguridad: RLS activada en todas y ningún acceso desde el navegador ----------------------------------------------------------
alter table public.solicitudes_acceso enable row level security;
alter table public.demos enable row level security;
alter table public.implantaciones enable row level security;
alter table public.implantacion_tareas enable row level security;
alter table public.soporte_consultas enable row level security;
revoke all on public.solicitudes_acceso, public.demos, public.implantaciones,
  public.implantacion_tareas, public.soporte_consultas from public, anon, authenticated;
grant select, insert, update, delete on public.solicitudes_acceso, public.demos,
  public.implantaciones, public.implantacion_tareas, public.soporte_consultas to service_role;
