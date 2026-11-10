-- Ajustes de la ficha de clientes tras 20261113100000_alta_clientes.sql (alta de clientes, de otra parte del panel):
--  1) Reenviar una invitación copia también la marca «propietario» (invitación de propietario de una empresa sin propietario).
--  2) Borrar una empresa conserva servicios_contratados (base de las facturas de servicios, como los datos fiscales).

-- 1) Reenviar invitación ---------------------------------------------------------------------------------------------------------
create or replace function public.admin_invitacion_reenviar(p_invitacion_id uuid, p_actor uuid, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.company_invitations;
  v_id uuid;
begin
  select * into v from public.company_invitations where id = p_invitacion_id for update;
  if not found or v.aceptada_en is not null then raise exception 'INVITACION_NO_REENVIABLE' using errcode = '22023'; end if;
  if not exists (select 1 from public.companies where id = v.company_id and estado = 'activa') then
    raise exception 'EMPRESA_NO_ACTIVA' using errcode = '22023';
  end if;
  -- Una invitación de propietario solo tiene sentido mientras la empresa no tenga propietario.
  if v.propietario and exists (select 1 from public.company_members where company_id = v.company_id and rol = 'propietario' and estado <> 'desactivado') then
    raise exception 'YA_HAY_PROPIETARIO: la empresa ya tiene propietario; invita como administrador' using errcode = '22023';
  end if;
  update public.company_invitations set revocada_en = now()
   where company_id = v.company_id and email = v.email and aceptada_en is null and revocada_en is null;
  insert into public.company_invitations (company_id, email, rol, propietario, token_hash, invitado_por)
  values (v.company_id, v.email, v.rol, v.propietario, p_token_hash, p_actor) returning id into v_id;
  return v_id;
end $$;

-- 2) Borrar la empresa (igual que en 20261113000000, conservando también servicios_contratados) --------------------------------
create or replace function public.admin_empresa_borrar(p_company_id uuid, p_nombre_confirmacion text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.companies;
  v_conservar text[] := array['credit_ledger', 'credit_lots', 'purchases', 'empresa_datos_fiscales', 'servicios_contratados', 'admin_audit_log'];
  -- Tablas de SAMGPLE que apuntan a la empresa sin ser datos suyos: se desvinculan (company_id = null), no se borran.
  v_desvincular text[] := array['solicitudes_acceso'];
  v_tablas text[];
  v_pendientes text[];
  v_siguiente text[];
  v_t text;
  v_n bigint;
  v_filas jsonb := '{}'::jsonb;
  v_miembros uuid[];
  v_ultimo_error text;
begin
  if not exists (select 1 from public.platform_roles where user_id = p_actor and activo and 'admin_samgple' = any (roles)) then
    raise exception 'SIN_PERMISO: solo admin_samgple borra empresas' using errcode = '42501';
  end if;
  select * into c from public.companies where id = p_company_id for update;
  if not found or c.es_examen then raise exception 'EMPRESA_NO_ENCONTRADA' using errcode = 'P0002'; end if;
  if c.estado = 'borrada' then raise exception 'YA_BORRADA' using errcode = '22023'; end if;
  if p_nombre_confirmacion is distinct from c.name then
    raise exception 'NOMBRE_NO_COINCIDE: escribe el nombre exacto de la empresa' using errcode = '22023';
  end if;

  -- Ninguna tarea nueva mientras se borra (y nadie entra: deja de estar 'activa').
  update public.companies set estado = 'borrada', borrada_en = now(), suspendida_motivo = null, suspendida_en = null where id = p_company_id;
  perform set_config('app.borrado_empresa', p_company_id::text, true);

  select coalesce(array_agg(distinct m.user_id), '{}') into v_miembros from public.company_members m where m.company_id = p_company_id;

  -- Secretos OAuth en el Vault.
  delete from vault.secrets where id in (select cc.token_ref from public.company_connections cc where cc.company_id = p_company_id and cc.token_ref is not null);

  foreach v_t in array v_desvincular loop
    execute format('update public.%I set company_id = null where company_id = $1', v_t) using p_company_id;
  end loop;

  select array_agg(c2.table_name::text order by c2.table_name) into v_tablas
    from information_schema.columns c2 join information_schema.tables t2 using (table_schema, table_name)
   where c2.table_schema = 'public' and c2.column_name = 'company_id' and t2.table_type = 'BASE TABLE'
     and c2.table_name::text <> all (v_conservar) and c2.table_name::text <> all (v_desvincular);

  -- Las claves foráneas entre tablas obligan a un orden: se repite la pasada hasta que todas quedan vacías.
  v_pendientes := v_tablas;
  for i in 1..30 loop
    exit when cardinality(v_pendientes) = 0;
    v_siguiente := '{}';
    foreach v_t in array v_pendientes loop
      begin
        execute format('delete from public.%I where company_id = $1', v_t) using p_company_id;
        get diagnostics v_n = row_count;
        v_filas := v_filas || jsonb_build_object(v_t, coalesce((v_filas ->> v_t)::bigint, 0) + v_n);
      exception when foreign_key_violation then
        v_siguiente := v_siguiente || v_t;
        v_ultimo_error := sqlerrm;
      end;
    end loop;
    if cardinality(v_siguiente) = cardinality(v_pendientes) then
      raise exception 'BORRADO_BLOQUEADO: no se pudieron borrar % (%)', array_to_string(v_siguiente, ', '), v_ultimo_error using errcode = '23503';
    end if;
    v_pendientes := v_siguiente;
  end loop;
  if cardinality(v_pendientes) > 0 then raise exception 'BORRADO_INCOMPLETO: %', array_to_string(v_pendientes, ', ') using errcode = '23503'; end if;

  -- Ninguna reserva viva ni lote utilizable: el saldo deja de existir (los lotes quedan como constancia contable).
  return jsonb_build_object('filas', v_filas, 'miembros', to_jsonb(v_miembros), 'nombre', c.name);
end $$;

revoke all on function public.admin_invitacion_reenviar(uuid, uuid, text), public.admin_empresa_borrar(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_invitacion_reenviar(uuid, uuid, text), public.admin_empresa_borrar(uuid, text, uuid) to service_role;
