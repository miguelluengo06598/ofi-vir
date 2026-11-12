-- Meta Lead Ads (leads de formularios de anuncios de Facebook e Instagram). Primera integración real.
--
--  · meta_pages: páginas de Facebook que una empresa ha conectado. El token de página vive cifrado en Vault (token_ref).
--  · meta_forms: formularios de leads de cada página; la empresa decide de cuáles quiere recibir leads (activo).
--  · meta_lead_events: cada aviso «leadgen» del webhook. SOLO identificadores: nunca los datos personales del lead
--    (esos se piden a Meta al procesar y van al contacto y a la memoria, donde alcanza el borrado RGPD).
--  · meta_page_conflicts: una página solo puede estar conectada a UNA empresa a la vez. Si otra empresa intenta
--    conectarla no se conecta: queda una solicitud para que la revise el equipo de MyOfia.
--
-- La empresa solo LEE (y nunca ve token_ref). Todo cambio pasa por funciones SECURITY DEFINER que solo ejecuta el
-- servidor (service_role), como el resto de conexiones.

-- 1) Páginas ---------------------------------------------------------------------------------------------------------
create table public.meta_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  connection_id uuid not null,
  page_id text not null check (page_id ~ '^[0-9]{1,32}$'),
  nombre text not null check (length(btrim(nombre)) between 1 and 300),
  token_ref uuid,                                   -- id del secreto en vault.secrets. NUNCA el token en claro.
  suscrita boolean not null default false,          -- la app está suscrita al campo «leadgen» de la página
  suscrita_en timestamptz,
  ultimo_lead_en timestamptz,
  estado text not null default 'activa' check (estado in ('activa', 'sin_permiso_leads', 'token_caducado', 'desconectada')),
  ultimo_error text check (ultimo_error is null or length(ultimo_error) <= 300),
  agent_id uuid,                                    -- agente que atiende los leads de esta página (por defecto, Lucía)
  pruebas_como_reales boolean not null default false,   -- la empresa quiere ver al agente atender los leads de prueba (gasta créditos)
  prueba_hasta timestamptz,                         -- «Enviar lead de prueba»: lo que llegue hasta entonces se marca como prueba
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (company_id, page_id),
  foreign key (company_id, connection_id) references public.company_connections (company_id, id) on delete cascade,
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete set null (agent_id),
  -- Una página «activa» siempre tiene token; una página solo está suscrita si está activa.
  constraint meta_pages_token_coherente check (estado <> 'activa' or token_ref is not null),
  constraint meta_pages_suscrita_coherente check (not suscrita or estado = 'activa')
);
-- Una página solo puede estar conectada a una empresa a la vez (las desconectadas no cuentan).
create unique index meta_pages_una_empresa_idx on public.meta_pages (page_id) where estado <> 'desconectada';
create index meta_pages_connection_idx on public.meta_pages (company_id, connection_id);

-- 2) Formularios -----------------------------------------------------------------------------------------------------
create table public.meta_forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  page_id text not null,
  form_id text not null check (form_id ~ '^[0-9]{1,32}$'),
  nombre text not null check (length(btrim(nombre)) between 1 and 300),
  activo boolean not null default true,             -- la empresa quiere recibir los leads de este formulario
  estado_meta text check (estado_meta is null or length(estado_meta) <= 40),   -- ACTIVE, ARCHIVED… tal como lo da Meta
  agent_id uuid,                                    -- null = el agente de la página
  ultimo_lead_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (company_id, form_id),
  foreign key (company_id, page_id) references public.meta_pages (company_id, page_id) on delete cascade,
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete set null (agent_id)
);
create index meta_forms_page_idx on public.meta_forms (company_id, page_id);

-- 3) Avisos de leads (solo ids) ----------------------------------------------------------------------------------------
create table public.meta_lead_events (
  id uuid primary key default gen_random_uuid(),
  page_id text not null check (page_id ~ '^[0-9]{1,32}$'),
  form_id text check (form_id is null or form_id ~ '^[0-9]{1,32}$'),
  leadgen_id text not null unique check (leadgen_id ~ '^[0-9]{1,32}$'),   -- único: Meta reintenta y puede repetir avisos
  ad_id text check (ad_id is null or ad_id ~ '^[0-9]{1,32}$'),
  adgroup_id text check (adgroup_id is null or adgroup_id ~ '^[0-9]{1,32}$'),
  created_time timestamptz,                         -- cuándo se creó el lead en Meta
  recibido_en timestamptz not null default now(),
  estado text not null default 'recibido' check (estado in ('recibido', 'procesado', 'duplicado', 'error', 'ignorado')),
  intentos integer not null default 0 check (intentos >= 0),
  ultimo_error text check (ultimo_error is null or length(ultimo_error) <= 300),
  es_prueba boolean not null default false,         -- lead de prueba: no gasta créditos ni se trata como real (salvo pruebas_como_reales)
  company_id uuid references public.companies (id) on delete cascade    -- null si la página no está conectada a nadie
);
create index meta_lead_events_company_idx on public.meta_lead_events (company_id, recibido_en desc) where company_id is not null;
create index meta_lead_events_pendientes_idx on public.meta_lead_events (recibido_en) where estado in ('recibido', 'error');
create index meta_lead_events_page_idx on public.meta_lead_events (page_id, recibido_en desc);

-- 4) Intentos de conectar una página que ya tiene otra empresa (los revisa MyOfia) ------------------------------------
create table public.meta_page_conflicts (
  id uuid primary key default gen_random_uuid(),
  page_id text not null check (page_id ~ '^[0-9]{1,32}$'),
  nombre text,
  empresa_solicitante uuid not null references public.companies (id) on delete cascade,
  solicitado_por uuid,
  empresa_actual uuid references public.companies (id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid,
  motivo text check (motivo is null or length(motivo) <= 1000)
);
-- Una sola solicitud pendiente por página y empresa solicitante (reintentar no las multiplica).
create unique index meta_page_conflicts_pendiente_idx on public.meta_page_conflicts (page_id, empresa_solicitante) where estado = 'pendiente';

-- 5) RLS: la empresa solo lee lo suyo; el conflicto no lo ve nadie de fuera -------------------------------------------
alter table public.meta_pages enable row level security;
alter table public.meta_forms enable row level security;
alter table public.meta_lead_events enable row level security;
alter table public.meta_page_conflicts enable row level security;   -- sin políticas: solo service_role

create policy meta_pages_select on public.meta_pages for select to authenticated using (public.es_miembro(company_id));
create policy meta_forms_select on public.meta_forms for select to authenticated using (public.es_miembro(company_id));
create policy meta_lead_events_select on public.meta_lead_events for select to authenticated
  using (company_id is not null and public.es_miembro(company_id));

revoke all on public.meta_pages, public.meta_forms, public.meta_lead_events, public.meta_page_conflicts from public, anon, authenticated;
-- Sin token_ref: la empresa nunca ve ni el id del secreto.
grant select (id, company_id, connection_id, page_id, nombre, suscrita, suscrita_en, ultimo_lead_en, estado, ultimo_error, agent_id, pruebas_como_reales, prueba_hasta, creado_en, actualizado_en)
  on public.meta_pages to authenticated;
grant select on public.meta_forms, public.meta_lead_events to authenticated;
grant select, insert, update, delete on public.meta_pages, public.meta_forms, public.meta_lead_events, public.meta_page_conflicts to service_role;

-- 6) Al borrar una página (o su empresa, o su conexión) se borra su secreto del Vault ---------------------------------
create function public.meta_pages_borrar_secreto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.token_ref is not null then delete from vault.secrets where id = old.token_ref; end if;
  return old;
end;
$$;
create trigger meta_pages_borrar_secreto after delete on public.meta_pages
  for each row execute function public.meta_pages_borrar_secreto();

-- Si la conexión de Meta deja de estar «conectado» (desconectada, caducada o con error), sus páginas dejan de estar
-- activas y sus tokens se borran. Anular la suscripción en Meta lo hace antes el servidor (mejor esfuerzo).
create function public.meta_pages_seguir_conexion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ref uuid;
begin
  if new.proveedor <> 'meta_leads' or new.estado = 'conectado' or old.estado is not distinct from new.estado then return new; end if;
  for v_ref in
    update public.meta_pages p
       set estado = case when new.estado = 'caducado' then 'token_caducado' else 'desconectada' end,
           suscrita = false, token_ref = null, actualizado_en = now()
      from (select id, token_ref from public.meta_pages where company_id = new.company_id and connection_id = new.id and estado <> 'desconectada' for update) viejo
     where p.id = viejo.id
    returning viejo.token_ref
  loop
    if v_ref is not null then delete from vault.secrets where id = v_ref; end if;
  end loop;
  return new;
end;
$$;
create trigger meta_pages_seguir_conexion after update of estado on public.company_connections
  for each row execute function public.meta_pages_seguir_conexion();

-- 7) Conectar una página: atómico, y nunca si la tiene otra empresa ---------------------------------------------------
-- Devuelve {ok:true, id} o {ok:false, motivo:'pagina_en_otra_empresa', conflicto_id}. En el segundo caso NO conecta
-- nada: deja la solicitud en meta_page_conflicts para que la revise MyOfia.
create function public.meta_pagina_conectar(
  p_company_id uuid, p_connection_id uuid, p_user_id uuid, p_page_id text, p_nombre text, p_secreto text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_otra uuid;
  v_id uuid;
  v_anterior uuid;
  v_ref uuid;
  v_conflicto uuid;
begin
  if p_secreto is null or length(p_secreto) < 20 then raise exception 'TOKEN_NO_VALIDO' using errcode = '22023'; end if;
  if not exists (select 1 from public.company_connections
                  where id = p_connection_id and company_id = p_company_id and proveedor = 'meta_leads' and estado = 'conectado') then
    raise exception 'CONEXION_NO_VALIDA: la conexión de Meta no está activa' using errcode = 'P0002';
  end if;
  -- Dos empresas conectando la misma página a la vez: solo una pasa.
  perform pg_advisory_xact_lock(hashtextextended('meta_page:' || p_page_id, 0));

  select company_id into v_otra from public.meta_pages
   where page_id = p_page_id and estado <> 'desconectada' and company_id <> p_company_id limit 1;
  if v_otra is not null then
    insert into public.meta_page_conflicts (page_id, nombre, empresa_solicitante, solicitado_por, empresa_actual)
    values (p_page_id, left(btrim(p_nombre), 300), p_company_id, p_user_id, v_otra)
    on conflict (page_id, empresa_solicitante) where estado = 'pendiente' do update set creado_en = now(), solicitado_por = excluded.solicitado_por
    returning id into v_conflicto;
    return jsonb_build_object('ok', false, 'motivo', 'pagina_en_otra_empresa', 'conflicto_id', v_conflicto);
  end if;

  insert into public.meta_pages (company_id, connection_id, page_id, nombre, estado, suscrita)
  values (p_company_id, p_connection_id, p_page_id, left(btrim(p_nombre), 300), 'desconectada', false)
  on conflict (company_id, page_id) do update
    set connection_id = excluded.connection_id, nombre = excluded.nombre, ultimo_error = null, actualizado_en = now()
  returning id, token_ref into v_id, v_anterior;

  v_ref := vault.create_secret(p_secreto, 'meta_page:' || v_id || ':' || gen_random_uuid(), 'Token de página de Meta (meta_pages)');
  update public.meta_pages set token_ref = v_ref, estado = 'activa', actualizado_en = now() where id = v_id;
  if v_anterior is not null then delete from vault.secrets where id = v_anterior; end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Estado de la suscripción y errores (sin datos sensibles). Con token_caducado o desconectada se borra el token.
create function public.meta_pagina_actualizar(
  p_company_id uuid, p_id uuid, p_estado text, p_suscrita boolean, p_error text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_ref uuid;
begin
  select token_ref into v_ref from public.meta_pages where id = p_id and company_id = p_company_id for update;
  if not found then return false; end if;
  update public.meta_pages
     set estado = p_estado,
         suscrita = (p_estado = 'activa' and coalesce(p_suscrita, false)),
         suscrita_en = case when p_estado = 'activa' and coalesce(p_suscrita, false) and not suscrita then now() else suscrita_en end,
         token_ref = case when p_estado in ('token_caducado', 'desconectada') then null else token_ref end,
         ultimo_error = left(p_error, 300), actualizado_en = now()
   where id = p_id;
  if p_estado in ('token_caducado', 'desconectada') and v_ref is not null then delete from vault.secrets where id = v_ref; end if;
  return true;
end;
$$;

-- El token de página, solo para el servidor y solo mientras la página lo conserva (activa o pendiente de acceso a leads).
create function public.meta_pagina_token(p_company_id uuid, p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret
    from public.meta_pages p join vault.decrypted_secrets s on s.id = p.token_ref
   where p.id = p_id and p.company_id = p_company_id and p.estado in ('activa', 'sin_permiso_leads')
$$;

-- 8) Revisión de MyOfia: aprobar libera la página (la empresa anterior queda desconectada) y la solicitante puede
--    volver a conectarla; rechazar no cambia nada. Solo admin_samgple, con motivo y auditoría.
create function public.meta_pagina_conflicto_resolver(p_conflicto uuid, p_actor uuid, p_aprobar boolean, p_motivo text, p_ip inet default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.meta_page_conflicts;
  v_ref uuid;
  v_liberadas integer := 0;
begin
  if not exists (select 1 from public.platform_roles where user_id = p_actor and activo and (rol = 'admin_samgple' or 'admin_samgple' = any (roles))) then
    raise exception 'SIN_PERMISO: solo administración resuelve conflictos de páginas' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'MOTIVO_OBLIGATORIO' using errcode = '22023'; end if;
  select * into v_c from public.meta_page_conflicts where id = p_conflicto and estado = 'pendiente' for update;
  if not found then raise exception 'CONFLICTO_NO_PENDIENTE' using errcode = 'P0002'; end if;

  if p_aprobar then
    perform pg_advisory_xact_lock(hashtextextended('meta_page:' || v_c.page_id, 0));
    for v_ref in
      update public.meta_pages p set estado = 'desconectada', suscrita = false, token_ref = null,
             ultimo_error = 'Página reasignada a otra empresa tras revisión', actualizado_en = now()
        from (select id, token_ref from public.meta_pages
               where page_id = v_c.page_id and estado <> 'desconectada' and company_id <> v_c.empresa_solicitante for update) viejo
       where p.id = viejo.id
      returning viejo.token_ref
    loop
      v_liberadas := v_liberadas + 1;
      if v_ref is not null then delete from vault.secrets where id = v_ref; end if;
    end loop;
  end if;

  update public.meta_page_conflicts
     set estado = case when p_aprobar then 'aprobado' else 'rechazado' end, resuelto_en = now(), resuelto_por = p_actor, motivo = btrim(p_motivo)
   where id = p_conflicto;
  insert into public.admin_audit_log (actor_id, ip, accion, company_id, objeto_tipo, objeto_id, antes, despues, motivo)
  values (p_actor, p_ip, case when p_aprobar then 'meta.pagina_reasignar' else 'meta.pagina_conflicto_rechazar' end, v_c.empresa_solicitante,
          'meta_page', v_c.page_id, jsonb_build_object('empresa_actual', v_c.empresa_actual),
          jsonb_build_object('empresa_solicitante', v_c.empresa_solicitante, 'paginas_liberadas', v_liberadas), btrim(p_motivo));
  return jsonb_build_object('estado', case when p_aprobar then 'aprobado' else 'rechazado' end, 'paginas_liberadas', v_liberadas);
end;
$$;

-- 9) Registrar un aviso «leadgen» del webhook: atómico e idempotente (Meta reintenta y puede repetir). Solo ids.
-- Devuelve {estado, nuevo}: 'recibido' (hay que procesarlo), 'ignorado' (página sin conectar o sin suscribir, o formulario
-- que la empresa no quiere) o, si ya existía, el estado que tuviera con nuevo=false.
create function public.meta_lead_registrar(
  p_page_id text, p_form_id text, p_leadgen_id text, p_ad_id text, p_adgroup_id text, p_created_time timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pagina public.meta_pages;
  v_activo boolean;
  v_estado text := 'recibido';
  v_prueba boolean := false;
  v_id uuid;
begin
  select * into v_pagina from public.meta_pages where page_id = p_page_id and estado <> 'desconectada' limit 1;
  if not found or v_pagina.estado <> 'activa' or not v_pagina.suscrita then
    v_estado := 'ignorado';
  else
    select activo into v_activo from public.meta_forms where company_id = v_pagina.company_id and form_id = p_form_id;
    -- Un formulario que aún no conocemos se acepta (se creó después de elegir); uno desmarcado se ignora.
    if v_activo is false then v_estado := 'ignorado'; end if;
    v_prueba := v_pagina.prueba_hasta is not null and v_pagina.prueba_hasta > now();
  end if;

  insert into public.meta_lead_events (page_id, form_id, leadgen_id, ad_id, adgroup_id, created_time, estado, es_prueba, company_id)
  values (p_page_id, p_form_id, p_leadgen_id, p_ad_id, p_adgroup_id, p_created_time, v_estado, v_prueba, v_pagina.company_id)
  on conflict (leadgen_id) do nothing
  returning id into v_id;
  if v_id is null then
    return (select jsonb_build_object('estado', estado, 'nuevo', false) from public.meta_lead_events where leadgen_id = p_leadgen_id);
  end if;
  if v_pagina.id is not null and v_estado = 'recibido' then
    update public.meta_pages set ultimo_lead_en = now() where id = v_pagina.id;
    update public.meta_forms set ultimo_lead_en = now() where company_id = v_pagina.company_id and form_id = p_form_id;
  end if;
  return jsonb_build_object('estado', v_estado, 'nuevo', true, 'es_prueba', v_prueba);
end;
$$;
revoke all on function public.meta_lead_registrar(text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.meta_lead_registrar(text, text, text, text, text, timestamptz) to service_role;

revoke all on function public.meta_pages_borrar_secreto(), public.meta_pages_seguir_conexion(),
  public.meta_pagina_conectar(uuid, uuid, uuid, text, text, text), public.meta_pagina_actualizar(uuid, uuid, text, boolean, text),
  public.meta_pagina_token(uuid, uuid), public.meta_pagina_conflicto_resolver(uuid, uuid, boolean, text, inet) from public, anon, authenticated;
grant execute on function public.meta_pagina_conectar(uuid, uuid, uuid, text, text, text), public.meta_pagina_actualizar(uuid, uuid, text, boolean, text),
  public.meta_pagina_token(uuid, uuid), public.meta_pagina_conflicto_resolver(uuid, uuid, boolean, text, inet) to service_role;

comment on table public.meta_lead_events is 'Avisos leadgen del webhook de Meta. Solo identificadores: los datos personales del lead no se guardan aquí.';
comment on table public.meta_page_conflicts is 'Intentos de conectar una página de Facebook que ya tiene otra empresa. Los revisa MyOfia; la empresa no los ve.';
