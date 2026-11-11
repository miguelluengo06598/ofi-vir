-- Configuración inicial: crear el PRIMER administrador general de la plataforma (admin_samgple) desde la
-- web, una sola vez. En cuanto existe cualquier admin_samgple (activo o no), la función se niega siempre:
-- los siguientes administradores los da de alta un administrador desde el panel, nunca desde esta puerta.
-- Solo service_role (la llama el servidor tras comprobar la clave de instalación).

create or replace function public.plataforma_tiene_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_roles
    where rol = 'admin_samgple' or 'admin_samgple' = any (roles)
  );
$$;

create or replace function public.plataforma_crear_primer_admin(p_user_id uuid, p_nombre text, p_email text, p_ip inet default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Un candado de transacción: dos peticiones a la vez no pueden crear dos «primeros» administradores.
  perform pg_advisory_xact_lock(hashtext('plataforma_crear_primer_admin'));

  if public.plataforma_tiene_admin() then
    raise exception 'YA_CONFIGURADO: la plataforma ya tiene un administrador' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'DATOS_NO_VALIDOS: falta el nombre' using errcode = '22023';
  end if;

  insert into public.users (id, full_name, email)
  values (p_user_id, trim(p_nombre), lower(trim(p_email)))
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email;

  insert into public.platform_roles (user_id, rol, roles, nombre, activo)
  values (p_user_id, 'admin_samgple', array['admin_samgple'], trim(p_nombre), true);

  insert into public.admin_audit_log (actor_id, ip, accion, objeto_tipo, objeto_id, despues, motivo)
  values (p_user_id, p_ip, 'configuracion_inicial.primer_admin', 'platform_roles', p_user_id::text,
          jsonb_build_object('roles', array['admin_samgple']), 'Primer administrador creado desde la configuración inicial');
end;
$$;

revoke all on function public.plataforma_tiene_admin() from public, anon, authenticated;
revoke all on function public.plataforma_crear_primer_admin(uuid, text, text, inet) from public, anon, authenticated;
grant execute on function public.plataforma_tiene_admin() to service_role;
grant execute on function public.plataforma_crear_primer_admin(uuid, text, text, inet) to service_role;
