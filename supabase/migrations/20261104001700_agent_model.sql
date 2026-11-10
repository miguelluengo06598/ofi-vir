-- Fase 2 · Modelo de agentes: plantillas de IDESIE, agentes, herramientas, reglas, traspasos, conocimiento,
-- versiones, correcciones, conexiones cifradas y certificación. Ver CLAUDE.md, sección «Modelo de agentes».
--
-- Se ADAPTAN las tablas que ya existían (departments, agents, tasks); no se duplican. Correspondencia con los nombres pedidos:
--   departments.name = nombre · departments.created_at = creado_en
--   agents.name = nombre · agents.role = rol · agents.created_at = creado_en · agents.created_by (nuevo) = creado_por
--   agents.status (working/waiting/…) sigue siendo el estado EN VIVO; agents.estado (nuevo) es el ciclo de vida/certificación.
--   agents.instructions (existente, lo lee el motor hoy) convive con instrucciones_empresa hasta que el motor monte
--   «instrucciones_base de la plantilla + instrucciones_empresa».
--
-- Principios de seguridad:
--   · Una empresa NUNCA puede ponerse a sí misma un agente como certificado/activo: lo impide un trigger en la base
--     (no solo la interfaz). Solo el servidor (service_role) cambia version_certificada, certificado_hasta y los estados de certificación.
--   · instrucciones_base solo existe en agent_templates, que no es legible por ninguna empresa (ver más abajo).
--   · Los tokens OAuth van en Supabase Vault; la tabla solo guarda una referencia (token_ref), que ni siquiera se puede leer desde el navegador.

-- 0) Utilidades ----------------------------------------------------------------------------------------------------------
create function public.touch_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create function public.solo_insercion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La tabla % es de solo inserción: % no está permitido (los cambios son filas nuevas)', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

-- 1) Departamentos: se amplía la tabla existente -------------------------------------------------------------------------
alter table public.departments
  add column tipo text not null default 'personalizado'
    check (tipo in ('ventas', 'atencion', 'marketing', 'operaciones', 'direccion', 'personalizado')),
  add column activo boolean not null default true,
  add column orden integer not null default 0;
-- Los departamentos que ya existían usan como slug el tipo estándar.
update public.departments set tipo = slug where slug in ('ventas', 'atencion', 'marketing', 'operaciones', 'direccion');
update public.departments set orden = case slug
  when 'ventas' then 1 when 'atencion' then 2 when 'marketing' then 3 when 'operaciones' then 4 when 'direccion' then 5 else 6 end;

-- 2) Plantillas de IDESIE (sin company_id) ------------------------------------------------------------------------------
create table public.agent_templates (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre_por_defecto text not null,
  rol text not null,
  departamento_tipo text not null
    check (departamento_tipo in ('ventas', 'atencion', 'marketing', 'operaciones', 'direccion', 'personalizado')),
  descripcion_publica text not null,
  que_hace text not null default '',
  que_no_hace text not null default '',
  -- PROTEGIDA: solo el servidor con la clave de servicio la lee. Ninguna empresa, ni por tabla ni por vista.
  instrucciones_base text not null,
  -- [{ "id": "redactar_correo", "permiso_defecto": "aprobacion", "editable": true }, …]
  herramientas_disponibles jsonb not null default '[]'::jsonb check (jsonb_typeof(herramientas_disponibles) = 'array'),
  integraciones_requeridas jsonb not null default '[]'::jsonb check (jsonb_typeof(integraciones_requeridas) = 'array'),
  tipo_tarea_por_defecto text not null default 'estandar' check (tipo_tarea_por_defecto in ('simple', 'estandar', 'experta')),
  version integer not null default 1 check (version >= 1),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger agent_templates_touch before update on public.agent_templates
  for each row execute function public.touch_actualizado_en();

-- Protección de instrucciones_base (tres capas):
--  1) RLS activada y SIN ninguna política: un usuario autenticado ve 0 filas.
--  2) Sin permiso de tabla para anon/authenticated (revoke): ni siquiera llega a la RLS, recibe «permission denied».
--  3) La única puerta pública es la vista agent_templates_public, que no incluye la columna.
alter table public.agent_templates enable row level security;
revoke all on public.agent_templates from anon, authenticated;

create view public.agent_templates_public with (security_barrier = true) as
select id, nombre_por_defecto, rol, departamento_tipo, descripcion_publica, que_hace, que_no_hace,
       herramientas_disponibles, integraciones_requeridas, tipo_tarea_por_defecto, version, creado_en, actualizado_en
  from public.agent_templates
 where activa;
revoke all on public.agent_templates_public from anon;
grant select on public.agent_templates_public to authenticated, service_role;

-- 3) Agentes: se amplía la tabla existente ------------------------------------------------------------------------------
alter table public.agents
  add column template_id text references public.agent_templates (id),   -- null = agente propio
  add column avatar text,
  add column tono text not null default '',
  add column objetivo text not null default '',
  add column nunca_hace text not null default '',
  add column instrucciones_empresa text not null default '',
  add column negocio_resumen text not null default '',
  add column estado text not null default 'borrador'
    check (estado in ('borrador', 'en_pruebas', 'en_certificacion', 'rechazado', 'certificado', 'activo', 'pausado', 'suspendido', 'archivado')),
  add column version_actual integer not null default 1 check (version_actual >= 1),
  add column version_certificada integer check (version_certificada >= 1),
  add column certificado_hasta timestamptz,
  add column created_by uuid references public.users (id) on delete set null,
  add column actualizado_en timestamptz not null default now(),
  -- coherente: un agente certificado/activo tiene versión certificada y fecha de recertificación.
  add constraint agents_certificado_coherente check (
    estado not in ('certificado', 'activo') or (version_certificada is not null and certificado_hasta is not null)
  );
-- Ya no hay creadores externos: el creador por defecto es IDESIE (la columna se conserva por el marketplace futuro).
alter table public.agents alter column creator_name set default 'IDESIE';
create index agents_estado_idx on public.agents (company_id, estado);
create index agents_template_idx on public.agents (template_id) where template_id is not null;
create trigger agents_touch before update on public.agents
  for each row execute function public.touch_actualizado_en();

-- Ciclo de vida: la persona de la empresa NO puede certificar, activar sin certificado ni tocar la versión certificada.
-- Se aplica solo a quien entra por la API con su sesión (authenticated); el servidor (service_role) y las migraciones pasan.
create function public.agents_proteger_ciclo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vigente boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.estado <> 'borrador' or new.version_certificada is not null or new.certificado_hasta is not null
       or new.template_id is not null or new.version_actual <> 1 then
      raise exception 'AGENTE_CICLO: un agente nuevo nace en borrador, sin certificar y sin plantilla (las plantillas las instancia el servidor)'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.template_id is distinct from old.template_id
     or new.version_certificada is distinct from old.version_certificada
     or new.certificado_hasta is distinct from old.certificado_hasta
     or new.version_actual is distinct from old.version_actual then
    raise exception 'AGENTE_CICLO: la plantilla, la versión y la certificación solo las cambia el servidor' using errcode = '42501';
  end if;

  if new.estado is distinct from old.estado then
    -- Reanudar/activar solo con una certificación vigente de la versión certificada (RLS: solo ve las de su empresa).
    select exists (
      select 1 from public.certifications c
       where c.agent_id = old.id and c.company_id = old.company_id and c.agent_version = old.version_certificada
         and c.estado = 'vigente' and c.caduca_en > now()
    ) and old.certificado_hasta > now() into v_vigente;

    if not (
         (old.estado = 'borrador' and new.estado = 'en_pruebas')
      or (old.estado = 'en_pruebas' and new.estado = 'borrador')
      or (old.estado = 'rechazado' and new.estado in ('borrador', 'en_pruebas'))
      or (old.estado in ('certificado', 'pausado') and new.estado = 'activo' and coalesce(v_vigente, false))
      or (old.estado = 'activo' and new.estado = 'pausado')
      or (new.estado = 'archivado' and old.estado not in ('en_certificacion', 'suspendido'))
    ) then
      raise exception 'AGENTE_CICLO: la empresa no puede pasar un agente de % a %', old.estado, new.estado using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger agents_proteger_ciclo before insert or update on public.agents
  for each row execute function public.agents_proteger_ciclo();

-- 4) Herramientas por agente ---------------------------------------------------------------------------------------------
create table public.agent_tools (
  agent_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  tool_id text not null,
  permiso text not null check (permiso in ('sola', 'aprobacion', 'humano', 'prohibida')),
  limite_diario integer check (limite_diario >= 0),
  config jsonb not null default '{}'::jsonb,
  primary key (agent_id, tool_id),
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade
);
create index agent_tools_company_idx on public.agent_tools (company_id);

-- En un agente de plantilla, la empresa solo puede usar las herramientas que la plantilla ofrece y solo cambiar el permiso
-- de las marcadas como editables. SECURITY DEFINER porque la empresa no puede leer agent_templates.
create function public._herramienta_permitida(p_agent_id uuid, p_tool_id text, p_permiso text)
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
  select a.template_id into v_template from public.agents a
   where a.id = p_agent_id and a.company_id = (select public.current_company_id());
  if not found then return false; end if;
  if v_template is null then return true; end if;   -- agente propio: la empresa define todo
  select e into v_item from public.agent_templates t, jsonb_array_elements(t.herramientas_disponibles) e
   where t.id = v_template and e ->> 'id' = p_tool_id;
  if v_item is null then return false; end if;
  return coalesce((v_item ->> 'editable')::boolean, false) or v_item ->> 'permiso_defecto' = p_permiso;
end;
$$;
revoke all on function public._herramienta_permitida(uuid, text, text) from public;
grant execute on function public._herramienta_permitida(uuid, text, text) to authenticated, service_role;

create function public.agent_tools_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public._herramienta_permitida(new.agent_id, new.tool_id, new.permiso) then
    raise exception 'HERRAMIENTA_NO_PERMITIDA: la plantilla no ofrece «%» o no deja cambiar su permiso a «%»', new.tool_id, new.permiso
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger agent_tools_proteger before insert or update on public.agent_tools
  for each row execute function public.agent_tools_proteger();

-- 5) Reglas de funcionamiento ---------------------------------------------------------------------------------------------
create table public.agent_rules (
  agent_id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  zona_horaria text not null default 'Europe/Madrid',
  horario jsonb not null default '{"lun":[["09:00","18:00"]],"mar":[["09:00","18:00"]],"mie":[["09:00","18:00"]],"jue":[["09:00","18:00"]],"vie":[["09:00","18:00"]]}'::jsonb
    check (jsonb_typeof(horario) = 'object'),
  fuera_de_horario text not null default 'responder_y_avisar'
    check (fuera_de_horario in ('responder_y_avisar', 'no_responder', 'responder_normal')),
  mensaje_fuera_horario text,
  max_mensajes_dia integer check (max_mensajes_dia > 0),
  tope_creditos_mes integer check (tope_creditos_mes >= 0),   -- créditos enteros, nunca decimales
  aviso_ia_texto text,
  idioma text not null default 'es',
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade
);
create index agent_rules_company_idx on public.agent_rules (company_id);

-- 6) Traspasos configurados entre agentes ---------------------------------------------------------------------------------
create table public.agent_handoffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id_origen uuid not null,
  agent_id_destino uuid not null,
  condicion text not null,   -- lenguaje natural: «piden presupuesto de implantes»
  tipo_traspaso text not null check (tipo_traspaso in ('lead', 'cita', 'incidencia', 'datos', 'otro')),
  activo boolean not null default true,
  unique (company_id, id),
  check (agent_id_origen <> agent_id_destino),
  -- Las claves compuestas impiden un traspaso hacia un agente de otra empresa.
  foreign key (company_id, agent_id_origen) references public.agents (company_id, id) on delete cascade,
  foreign key (company_id, agent_id_destino) references public.agents (company_id, id) on delete cascade
);
create index agent_handoffs_origen_idx on public.agent_handoffs (company_id, agent_id_origen);

-- 7) Conocimiento ---------------------------------------------------------------------------------------------------------
create table public.agent_knowledge (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid,   -- null = conocimiento de toda la oficina
  tipo text not null check (tipo in ('web', 'documento', 'faq', 'texto')),
  titulo text not null,
  origen text,     -- url o nombre de archivo
  estado text not null default 'procesando' check (estado in ('procesando', 'listo', 'error')),
  error text,
  creado_en timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade
);
create index agent_knowledge_agent_idx on public.agent_knowledge (company_id, agent_id);

-- El contenido troceado vive en la memoria (nodos de tipo «dato»), enlazado con su fuente: al borrar la fuente se borran sus trozos.
alter table public.memory_nodes add column knowledge_id uuid;
alter table public.memory_nodes
  add foreign key (company_id, knowledge_id) references public.agent_knowledge (company_id, id) on delete cascade;
create index memory_nodes_knowledge_idx on public.memory_nodes (company_id, knowledge_id) where knowledge_id is not null;

-- 8) Versiones (solo inserción) ---------------------------------------------------------------------------------------------
create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  company_id uuid not null references public.companies (id),   -- sin cascada: es un registro de auditoría
  version integer not null check (version >= 1),
  -- ficha, herramientas, reglas y traspasos. NUNCA instrucciones_base de la plantilla (la empresa puede leer esta tabla).
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and not (snapshot ? 'instrucciones_base')),
  motivo_cambio text,
  created_by uuid,   -- sin clave foránea: un ON DELETE SET NULL sería un UPDATE y la tabla es de solo inserción
  creado_en timestamptz not null default now(),
  unique (agent_id, version),
  foreign key (company_id, agent_id) references public.agents (company_id, id)
);
create index agent_versions_company_idx on public.agent_versions (company_id);
create trigger agent_versions_no_update_delete before update or delete on public.agent_versions
  for each row execute function public.solo_insercion();
create trigger agent_versions_no_truncate before truncate on public.agent_versions
  for each statement execute function public.solo_insercion();

-- Cada tarea registra con qué versión se ejecutó y si fue en el simulador.
alter table public.tasks
  add column agent_version integer,
  add column es_simulacion boolean not null default false;
create index tasks_agent_version_idx on public.tasks (company_id, agent_id, agent_version);

-- 9) Correcciones ---------------------------------------------------------------------------------------------------------
create table public.agent_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid not null,
  contexto text not null,
  respuesta_original text not null,
  respuesta_corregida text not null,
  regla_aprendida text,
  activa boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade
);
create index agent_corrections_agent_idx on public.agent_corrections (company_id, agent_id) where activa;

-- 10) Conexiones con aplicaciones externas (tokens cifrados en Supabase Vault) ---------------------------------------------
create table public.company_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  proveedor text not null,   -- 'whatsapp', 'meta_ads', 'meta_leads', 'hubspot', 'pipedrive', 'google_calendar', 'calendly', 'resend_dominio'…
  estado text not null default 'conectado' check (estado in ('conectado', 'caducado', 'error', 'desconectado')),
  cuenta_externa text,
  scopes jsonb not null default '[]'::jsonb,
  token_ref uuid,   -- id del secreto en vault.secrets. NUNCA el token en claro.
  caduca_en timestamptz,
  conectado_por uuid references public.users (id) on delete set null,
  conectado_en timestamptz not null default now(),
  ultimo_error text,
  unique (company_id, id)
);
create index company_connections_company_idx on public.company_connections (company_id);

-- Guardar/leer el token: solo el servidor. El token entra como texto, sale cifrado en vault.secrets y aquí solo queda su id.
create function public.guardar_token_conexion(p_company_id uuid, p_connection_id uuid, p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior uuid;
  v_ref uuid;
begin
  select token_ref into v_anterior from public.company_connections
   where id = p_connection_id and company_id = p_company_id for update;
  if not found then raise exception 'Conexión no encontrada' using errcode = 'P0002'; end if;
  v_ref := vault.create_secret(p_token, 'conexion:' || p_connection_id || ':' || gen_random_uuid(), 'Token de company_connections');
  update public.company_connections set token_ref = v_ref where id = p_connection_id;
  if v_anterior is not null then delete from vault.secrets where id = v_anterior; end if;
  return v_ref;
end;
$$;

create function public.leer_token_conexion(p_company_id uuid, p_connection_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
    from public.company_connections c
    join vault.decrypted_secrets s on s.id = c.token_ref
   where c.id = p_connection_id and c.company_id = p_company_id
$$;
revoke all on function public.guardar_token_conexion(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.leer_token_conexion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.guardar_token_conexion(uuid, uuid, text) to service_role;
grant execute on function public.leer_token_conexion(uuid, uuid) to service_role;

-- 11) Certificación ----------------------------------------------------------------------------------------------------------
-- Revisores del equipo de IDESIE (no son miembros de ninguna empresa).
create table public.reviewers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rol text not null check (rol in ('revisor_idesie', 'admin_idesie')),
  categorias text[] not null default '{}'
    check (categorias <@ array['ventas', 'atencion', 'marketing', 'operaciones', 'direccion', 'personalizado']),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.certification_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  agent_id uuid not null,
  agent_version integer not null check (agent_version >= 1),
  tipo text not null check (tipo in ('nueva', 'cambio_importante', 'periodica', 'cambio_modelo', 'plantilla')),
  via text not null default 'completa' check (via in ('rapida_plantilla', 'completa')),
  estado text not null default 'pendiente_examen'
    check (estado in ('pendiente_examen', 'examen_suspendido', 'pendiente_revision', 'en_revision', 'segunda_opinion', 'aprobada', 'rechazada', 'cancelada')),
  resumen_cambios text,
  enviado_por uuid references public.users (id) on delete set null,
  enviado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  unique (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id)
);
create index certification_requests_agent_idx on public.certification_requests (company_id, agent_id, enviado_en desc);
create index certification_requests_cola_idx on public.certification_requests (estado)
  where estado in ('pendiente_examen', 'pendiente_revision', 'en_revision', 'segunda_opinion');

create table public.certification_exams (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  company_id uuid not null references public.companies (id),
  agent_id uuid not null,
  agent_version integer not null,
  modelo_ia text not null,
  resultado text not null check (resultado in ('aprobado', 'suspendido')),
  nota_global numeric(5, 2) check (nota_global between 0 and 100),
  bloques jsonb not null default '{}'::jsonb,   -- resultado y nota de cada bloque
  casos jsonb not null default '[]'::jsonb,     -- entrada, respuesta, herramientas usadas y veredicto (interno)
  coste_ia_usd_micros bigint not null default 0 check (coste_ia_usd_micros >= 0),
  creado_en timestamptz not null default now(),
  foreign key (company_id, request_id) references public.certification_requests (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id)
);
create index certification_exams_request_idx on public.certification_exams (request_id);

create table public.certification_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.certification_requests (id),
  revisor_id uuid not null references public.reviewers (user_id),
  rol text not null check (rol in ('principal', 'segunda_opinion')),
  checklist jsonb not null default '[]'::jsonb,   -- cada punto con ok/no y comentario
  decision text not null check (decision in ('aprobar', 'rechazar', 'pedir_cambios')),
  comentario_para_empresa text,
  notas_internas text,   -- NUNCA visibles para la empresa
  creado_en timestamptz not null default now()
);
create index certification_reviews_request_idx on public.certification_reviews (request_id);

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  agent_id uuid not null,
  agent_version integer not null check (agent_version >= 1),
  request_id uuid not null,
  certificado_en timestamptz not null default now(),
  caduca_en timestamptz not null,
  estado text not null default 'vigente' check (estado in ('vigente', 'caducada', 'retirada')),
  motivo_retirada text,
  foreign key (company_id, request_id) references public.certification_requests (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id),
  check (estado <> 'retirada' or motivo_retirada is not null)
);
create unique index certifications_una_vigente_idx on public.certifications (agent_id, agent_version) where estado = 'vigente';
create index certifications_agent_idx on public.certifications (company_id, agent_id);

-- Certificación de las versiones de las plantillas (interna de IDESIE: sin company_id, sin acceso para las empresas).
create table public.template_certifications (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references public.agent_templates (id),
  template_version integer not null check (template_version >= 1),
  certificado_por uuid references public.reviewers (user_id),
  certificado_en timestamptz not null default now(),
  caduca_en timestamptz not null,
  estado text not null default 'vigente' check (estado in ('vigente', 'caducada', 'retirada')),
  motivo_retirada text,
  check (estado <> 'retirada' or motivo_retirada is not null)
);
create unique index template_certifications_una_vigente_idx on public.template_certifications (template_id, template_version) where estado = 'vigente';

-- Vistas para la empresa: sin notas internas ni revisores, y sin los casos del examen (una respuesta del agente podría
-- citar sus instrucciones base). Las vistas filtran por la empresa de la sesión.
create view public.certification_exams_empresa with (security_barrier = true) as
select id, request_id, company_id, agent_id, agent_version, resultado, nota_global, bloques, creado_en
  from public.certification_exams
 where company_id = (select public.current_company_id());

create view public.certification_reviews_empresa with (security_barrier = true) as
select r.id, r.request_id, q.company_id, q.agent_id, q.agent_version, r.decision, r.comentario_para_empresa, r.creado_en
  from public.certification_reviews r
  join public.certification_requests q on q.id = r.request_id
 where q.company_id = (select public.current_company_id())
   and (q.estado in ('aprobada', 'rechazada') or r.decision = 'pedir_cambios');   -- sin opiniones a medias

-- 12) ¿Puede trabajar este agente con datos reales? -------------------------------------------------------------------------
-- El motor la llama antes de cada tarea real (no simulada). Solo el servidor.
create function public.agente_puede_trabajar(p_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.estado = 'activo'
       and a.version_certificada is not null
       and a.certificado_hasta is not null and a.certificado_hasta > now()
       and exists (
         select 1 from public.certifications c
          where c.agent_id = a.id and c.company_id = a.company_id
            and c.agent_version = a.version_certificada
            and c.estado = 'vigente' and c.caduca_en > now()
       )
      from public.agents a
     where a.id = p_agent_id
  ), false)
$$;
revoke all on function public.agente_puede_trabajar(uuid) from public, anon, authenticated;
grant execute on function public.agente_puede_trabajar(uuid) to service_role;

-- 13) Permisos y RLS ----------------------------------------------------------------------------------------------------------
alter table public.agent_tools enable row level security;
alter table public.agent_rules enable row level security;
alter table public.agent_handoffs enable row level security;
alter table public.agent_knowledge enable row level security;
alter table public.agent_versions enable row level security;
alter table public.agent_corrections enable row level security;
alter table public.company_connections enable row level security;
alter table public.reviewers enable row level security;
alter table public.certification_requests enable row level security;
alter table public.certification_exams enable row level security;
alter table public.certification_reviews enable row level security;
alter table public.certifications enable row level security;
alter table public.template_certifications enable row level security;

-- Tablas internas de IDESIE: sin permisos ni políticas para las empresas.
revoke all on public.reviewers, public.template_certifications, public.certification_exams, public.certification_reviews
  from anon, authenticated;
revoke all on public.agent_templates, public.agent_templates_public, public.certification_exams_empresa, public.certification_reviews_empresa from anon;

grant select on public.agent_tools, public.agent_rules, public.agent_handoffs, public.agent_knowledge,
  public.agent_versions, public.agent_corrections, public.certification_requests, public.certifications to authenticated;
-- Conexiones: se lee todo MENOS token_ref (permiso por columna).
grant select (id, company_id, proveedor, estado, cuenta_externa, scopes, caduca_en, conectado_por, conectado_en, ultimo_error)
  on public.company_connections to authenticated;
grant select on public.certification_exams_empresa, public.certification_reviews_empresa to authenticated;

-- Lectura: solo la empresa propia.
do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_tools', 'agent_rules', 'agent_handoffs', 'agent_knowledge', 'agent_versions', 'agent_corrections',
    'company_connections', 'certification_requests', 'certifications'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (company_id = (select public.current_company_id()))',
      t || '_select', t
    );
  end loop;
end $$;

-- Escritura de la configuración: propietarios y administradores (como agents). Las versiones, las conexiones y todo lo de
-- certificación lo escribe el servidor.
grant insert, update, delete on public.agent_tools, public.agent_rules, public.agent_handoffs, public.agent_knowledge to authenticated;
do $$
declare
  t text;
begin
  foreach t in array array['agent_tools', 'agent_rules', 'agent_handoffs', 'agent_knowledge'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (company_id = (select public.current_company_id()) and (select public.current_user_role()) in (''owner'', ''admin''))
         with check (company_id = (select public.current_company_id()) and (select public.current_user_role()) in (''owner'', ''admin''))',
      t || '_write', t
    );
  end loop;
end $$;

-- Las correcciones las puede hacer cualquier miembro que revise las respuestas.
grant insert, update, delete on public.agent_corrections to authenticated;
create policy agent_corrections_write on public.agent_corrections for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

grant select, insert, update, delete on public.agent_templates, public.agent_versions, public.agent_tools, public.agent_rules,
  public.agent_handoffs, public.agent_knowledge, public.agent_corrections, public.company_connections, public.reviewers,
  public.certification_requests, public.certification_exams, public.certification_reviews, public.certifications,
  public.template_certifications to service_role;
