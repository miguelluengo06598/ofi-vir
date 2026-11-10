-- Alta de clientes con plantilla de implantación (sustituye a la lista fija de 20261113100000_alta_clientes.sql):
--  · alta_cliente crea la empresa en estado 'en_implantacion' y genera sus tareas con implantacion_aplicar_plantilla (la plantilla
--    por defecto o p.plantilla_id). p.tareas se ignora si llega.
--  · Las implantaciones en curso creadas antes (tareas sin clave) pasan a la plantilla por defecto: sus tareas pendientes sin clave
--    se sustituyen por las de la plantilla (las hechas se quedan como historial) y la empresa pasa a 'en_implantacion'.

create or replace function public.alta_cliente(p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid := gen_random_uuid();
  v_impl uuid := gen_random_uuid();
  v_dep jsonb; v_ag jsonb; v_m jsonb; v_s jsonb;
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

  -- Nace «en implantación» (estado operativo: entra en su oficina; pasa a «activa» al completar la implantación).
  insert into public.companies (id, name, sector, tamano, web, estado)
  values (v_empresa, btrim(p -> 'empresa' ->> 'nombre'), nullif(p -> 'empresa' ->> 'sector', ''), nullif(p -> 'empresa' ->> 'tamano', ''), nullif(p -> 'empresa' ->> 'web', ''), 'en_implantacion');

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
  -- Las tareas salen de la plantilla de implantación (por defecto, o la indicada en p.plantilla_id). p.tareas se ignora: lo
  -- mandaban versiones anteriores del asistente.
  perform public.implantacion_aplicar_plantilla(v_impl, nullif(p ->> 'plantilla_id', '')::uuid);

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

-- Implantaciones anteriores -------------------------------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select i.id, i.company_id from public.implantaciones i join public.companies c on c.id = i.company_id
            where i.estado = 'en_curso' and i.plantilla_id is null and not c.es_examen and c.estado <> 'borrada' loop
    delete from public.implantacion_tareas where implantacion_id = r.id and clave is null and estado <> 'hecha';
    update public.companies set estado = 'en_implantacion' where id = r.company_id and estado = 'activa';
    perform public.implantacion_aplicar_plantilla(r.id, null);
  end loop;
end $$;

revoke all on function public.alta_cliente(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.alta_cliente(jsonb, uuid) to service_role;
