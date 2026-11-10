-- Comercial y alta de clientes (/admin/comercial). Tablero de solicitudes con notas y próximas acciones, servicios contratados,
-- invitación de propietario y una función de alta atómica: si algo falla, no se crea nada a medias.
-- Reutiliza cliente_ficha y empresa_datos_fiscales (20261113000000_admin_clientes) y admin_audit_log (20261111000001).
-- «En implantación» NO es un estado de la empresa (nace 'activa' para que RLS y sesiones funcionen igual): es su fila en
-- implantaciones con estado 'en_curso'.

-- 1) Solicitudes: columnas del tablero ------------------------------------------------------------------------------------------
alter table public.solicitudes_acceso drop constraint solicitudes_acceso_estado_check;
update public.solicitudes_acceso set estado = 'demo_hecha' where estado = 'demo';
update public.solicitudes_acceso set estado = 'cliente' where estado = 'convertida';
alter table public.solicitudes_acceso add constraint solicitudes_acceso_estado_check
  check (estado in ('nueva', 'contactada', 'demo_hecha', 'alta_en_curso', 'cliente', 'descartada'));
alter table public.solicitudes_acceso
  add column web text check (char_length(web) <= 200),
  -- Aceptación de la política de privacidad al enviar el formulario (obligatoria en la web; en altas manuales, no aplica).
  add column acepta_privacidad boolean not null default false;

create table public.solicitud_notas (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_acceso (id) on delete cascade,
  autor_id uuid references auth.users (id) on delete set null,
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  creado_en timestamptz not null default now()
);
create index solicitud_notas_idx on public.solicitud_notas (solicitud_id, creado_en desc);

create table public.solicitud_acciones (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_acceso (id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 300),
  vence_en date not null,
  responsable uuid references auth.users (id) on delete set null,
  hecha_en timestamptz,
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index solicitud_acciones_pendientes_idx on public.solicitud_acciones (vence_en) where hecha_en is null;

-- 2) Empresa: tamaño y web (los rellena el alta) -----------------------------------------------------------------------------------
alter table public.companies
  add column tamano text check (tamano in ('1-4', '5-20', '21-50', '51+')),
  add column web text check (char_length(web) <= 200);

-- 3) Servicios contratados en el alta (solo se registran: la factura de servicios va aparte) ---------------------------------------
create table public.servicios_contratados (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  servicio text not null check (servicio in ('implantacion', 'configuracion_departamentos', 'agentes_a_medida', 'gestion_mensual')),
  importe_centimos integer check (importe_centimos >= 0),
  periodicidad text not null default 'unico' check (periodicidad in ('unico', 'mensual')),
  notas text check (char_length(notas) <= 500),
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index servicios_contratados_empresa_idx on public.servicios_contratados (company_id);

-- 4) Tareas de implantación: de quién es cada una (SAMGPLE o el cliente, que la ve en su oficina) --------------------------------
alter table public.implantacion_tareas
  add column para text not null default 'samgple' check (para in ('samgple', 'cliente')),
  add column ayuda text check (char_length(ayuda) <= 300);

-- 5) Invitación de propietario ----------------------------------------------------------------------------------------------------
-- Una invitación normal nunca nombra propietario. La de propietario solo la crea alta_cliente, para una empresa recién creada y
-- sin propietario; su rol queda como 'admin' (la restricción de rol no cambia) y la marca `propietario` decide al aceptar.
alter table public.company_invitations add column propietario boolean not null default false;
alter table public.company_invitations add constraint company_invitations_propietario_rol check (not propietario or rol = 'admin');

create or replace function public.invitacion_aceptar(p_token_hash text, p_user_id uuid)
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
  if v_inv.propietario then
    -- Solo si la empresa sigue sin propietario (el índice único por empresa lo garantiza también).
    if exists (select 1 from public.company_members where company_id = v_inv.company_id and rol = 'propietario') then
      raise exception 'PROPIETARIO_YA_EXISTE: esta empresa ya tiene propietario' using errcode = '42501';
    end if;
    insert into public.company_members (company_id, user_id, rol, estado, puede_aprobar) values (v_inv.company_id, p_user_id, 'propietario', 'activo', true)
    on conflict (company_id, user_id) do update set rol = 'propietario', estado = 'activo', puede_aprobar = true;
  else
    insert into public.company_members (company_id, user_id, rol, estado) values (v_inv.company_id, p_user_id, v_inv.rol, 'activo')
    on conflict (company_id, user_id) do update set rol = excluded.rol, estado = 'activo'
      where public.company_members.rol <> 'propietario';
  end if;
  update public.company_invitations set aceptada_en = now(), aceptada_por = p_user_id where id = v_inv.id;
  return v_inv.company_id;
end;
$$;

-- 6) Alta de cliente, todo o nada -------------------------------------------------------------------------------------------------
-- p: { solicitud_id?, empresa:{nombre,sector?,tamano?,web?}, fiscales?:{razon_social,nif,direccion,codigo_postal,ciudad,provincia?,pais,email_facturacion},
--      propietario:{nombre,email,token_hash}, miembros:[{email,rol,token_hash}], servicios:[{servicio,importe_centimos?,periodicidad}],
--      departamentos:[{slug,nombre,tipo,orden}], agentes:[{template_id,nombre,rol,departamento_slug,slug}],
--      creditos?:{origen:'pack'|'regalo', pack_id?, creditos?, dias_caducidad?}, responsable, objetivo_fin?, tareas:[{titulo,para,ayuda?,vence_en?,orden}] }
-- Los tokens de invitación se generan en el servidor (Node) y aquí solo llega su huella SHA-256.
create function public.alta_cliente(p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid := gen_random_uuid();
  v_impl uuid := gen_random_uuid();
  v_dep jsonb; v_ag jsonb; v_m jsonb; v_s jsonb; v_t jsonb;
  v_dep_id uuid;
  v_tpl public.agent_templates;
  v_inv_ids jsonb := '[]'::jsonb;
  v_id uuid;
  v_solicitud uuid := nullif(p ->> 'solicitud_id', '')::uuid;
begin
  if not exists (select 1 from public.platform_roles where user_id = p_actor and activo) then
    raise exception 'SIN_PERMISO: solo el equipo de SAMGPLE da de alta clientes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.platform_roles where user_id = (p ->> 'responsable')::uuid and activo) then
    raise exception 'RESPONSABLE_NO_VALIDO: el responsable debe ser del equipo de SAMGPLE' using errcode = '22023';
  end if;
  if v_solicitud is not null and not exists (select 1 from public.solicitudes_acceso where id = v_solicitud and estado not in ('cliente', 'descartada') for update) then
    raise exception 'SOLICITUD_NO_VALIDA: la solicitud no existe o ya es cliente' using errcode = '22023';
  end if;

  insert into public.companies (id, name, sector, tamano, web)
  values (v_empresa, btrim(p -> 'empresa' ->> 'nombre'), nullif(p -> 'empresa' ->> 'sector', ''), nullif(p -> 'empresa' ->> 'tamano', ''), nullif(p -> 'empresa' ->> 'web', ''));

  for v_dep in select * from jsonb_array_elements(coalesce(p -> 'departamentos', '[]'::jsonb)) loop
    insert into public.departments (company_id, slug, name, tipo, orden)
    values (v_empresa, v_dep ->> 'slug', v_dep ->> 'nombre', v_dep ->> 'tipo', (v_dep ->> 'orden')::integer);
  end loop;

  -- Agentes en borrador desde plantillas (el disparador exige que la versión de la plantilla esté certificada).
  for v_ag in select * from jsonb_array_elements(coalesce(p -> 'agentes', '[]'::jsonb)) loop
    select * into v_tpl from public.agent_templates where id = v_ag ->> 'template_id' and activa;
    if not found then raise exception 'PLANTILLA_NO_DISPONIBLE: %', v_ag ->> 'template_id' using errcode = '22023'; end if;
    select id into v_dep_id from public.departments where company_id = v_empresa and slug = v_ag ->> 'departamento_slug';
    if v_dep_id is null then raise exception 'DEPARTAMENTO_NO_ELEGIDO para %', v_ag ->> 'template_id' using errcode = '22023'; end if;
    insert into public.agents (company_id, department_id, slug, name, role, creator_name, template_id, template_version, estado)
    values (v_empresa, v_dep_id, v_ag ->> 'slug', v_ag ->> 'nombre', v_ag ->> 'rol', 'SAMGPLE', v_tpl.id, v_tpl.version, 'borrador');
  end loop;

  if p -> 'creditos' is not null and p -> 'creditos' <> 'null'::jsonb then
    perform public.anadir_lote(v_empresa, p -> 'creditos' ->> 'origen', nullif(p -> 'creditos' ->> 'pack_id', ''),
      nullif(p -> 'creditos' ->> 'creditos', '')::integer, nullif(p -> 'creditos' ->> 'dias_caducidad', '')::integer,
      null, 'alta:' || v_empresa::text);
  end if;

  insert into public.implantaciones (id, company_id, estado, responsable, inicio, objetivo_fin)
  values (v_impl, v_empresa, 'en_curso', (p ->> 'responsable')::uuid, current_date, nullif(p ->> 'objetivo_fin', '')::date);
  for v_t in select * from jsonb_array_elements(coalesce(p -> 'tareas', '[]'::jsonb)) loop
    insert into public.implantacion_tareas (implantacion_id, titulo, orden, vence_en, para, ayuda)
    values (v_impl, v_t ->> 'titulo', coalesce((v_t ->> 'orden')::integer, 0), nullif(v_t ->> 'vence_en', '')::date, coalesce(v_t ->> 'para', 'samgple'), nullif(v_t ->> 'ayuda', ''));
  end loop;

  insert into public.cliente_ficha (company_id, responsable, servicios, actualizado_por)
  values (v_empresa, (p ->> 'responsable')::uuid,
          array(select distinct case s ->> 'servicio' when 'implantacion' then 'implantacion' when 'agentes_a_medida' then 'agente_a_medida' end
                  from jsonb_array_elements(coalesce(p -> 'servicios', '[]'::jsonb)) s
                 where s ->> 'servicio' in ('implantacion', 'agentes_a_medida')),
          p_actor);

  for v_s in select * from jsonb_array_elements(coalesce(p -> 'servicios', '[]'::jsonb)) loop
    insert into public.servicios_contratados (company_id, servicio, importe_centimos, periodicidad, creado_por)
    values (v_empresa, v_s ->> 'servicio', nullif(v_s ->> 'importe_centimos', '')::integer, coalesce(v_s ->> 'periodicidad', 'unico'), p_actor);
  end loop;

  if p -> 'fiscales' is not null and p -> 'fiscales' <> 'null'::jsonb then
    insert into public.empresa_datos_fiscales (company_id, razon_social, nif, direccion, codigo_postal, ciudad, provincia, pais, email_facturacion, actualizado_por)
    values (v_empresa, p -> 'fiscales' ->> 'razon_social', p -> 'fiscales' ->> 'nif', p -> 'fiscales' ->> 'direccion', p -> 'fiscales' ->> 'codigo_postal',
            p -> 'fiscales' ->> 'ciudad', nullif(p -> 'fiscales' ->> 'provincia', ''), coalesce(p -> 'fiscales' ->> 'pais', 'ES'), lower(p -> 'fiscales' ->> 'email_facturacion'), p_actor);
  end if;

  insert into public.company_invitations (company_id, email, rol, token_hash, invitado_por, propietario)
  values (v_empresa, lower(btrim(p -> 'propietario' ->> 'email')), 'admin', p -> 'propietario' ->> 'token_hash', p_actor, true)
  returning id into v_id;
  v_inv_ids := v_inv_ids || jsonb_build_object('id', v_id, 'email', lower(btrim(p -> 'propietario' ->> 'email')), 'propietario', true);
  for v_m in select * from jsonb_array_elements(coalesce(p -> 'miembros', '[]'::jsonb)) loop
    if (v_m ->> 'rol') not in ('admin', 'miembro') then raise exception 'ROL_NO_PERMITIDO: %', v_m ->> 'rol' using errcode = '22023'; end if;
    insert into public.company_invitations (company_id, email, rol, token_hash, invitado_por)
    values (v_empresa, lower(btrim(v_m ->> 'email')), (v_m ->> 'rol')::public.empresa_rol, v_m ->> 'token_hash', p_actor)
    returning id into v_id;
    v_inv_ids := v_inv_ids || jsonb_build_object('id', v_id, 'email', lower(btrim(v_m ->> 'email')), 'propietario', false);
  end loop;

  if v_solicitud is not null then
    update public.solicitudes_acceso set estado = 'cliente', company_id = v_empresa, actualizado_en = now() where id = v_solicitud;
  end if;

  insert into public.admin_audit_log (actor_id, accion, company_id, objeto_tipo, objeto_id, despues)
  values (p_actor, 'alta_cliente', v_empresa, 'empresa', v_empresa::text,
          jsonb_build_object('solicitud_id', v_solicitud, 'departamentos', jsonb_array_length(coalesce(p -> 'departamentos', '[]'::jsonb)),
                             'agentes', jsonb_array_length(coalesce(p -> 'agentes', '[]'::jsonb)), 'invitaciones', jsonb_array_length(v_inv_ids)));

  return jsonb_build_object('company_id', v_empresa, 'implantacion_id', v_impl, 'invitaciones', v_inv_ids);
end;
$$;

-- 7) Seguridad -------------------------------------------------------------------------------------------------------------------
alter table public.solicitud_notas enable row level security;
alter table public.solicitud_acciones enable row level security;
alter table public.servicios_contratados enable row level security;
revoke all on public.solicitud_notas, public.solicitud_acciones, public.servicios_contratados from public, anon, authenticated;
grant select, insert, update, delete on public.solicitud_notas, public.solicitud_acciones, public.servicios_contratados to service_role;
revoke all on function public.alta_cliente(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.alta_cliente(jsonb, uuid) to service_role;
