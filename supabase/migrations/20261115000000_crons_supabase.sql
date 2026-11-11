-- Tareas periódicas frecuentes lanzadas desde Supabase (pg_cron + pg_net).
--
-- El plan Hobby de Vercel solo admite crons diarios, así que en vercel.json quedan solo
-- caducar-creditos, revisar-estados y recertificacion. Las que corren cada hora o cada
-- pocos minutos las lanza la base llamando a la misma ruta de la web:
--   GET <cron_app_url>/api/cron/<tarea>  con  Authorization: Bearer <cron_secret>
--
-- Configuración (una vez por proyecto, en el SQL editor de Supabase; nunca en el repo):
--   select vault.create_secret('https://tu-dominio.vercel.app', 'cron_app_url');
--   select vault.create_secret('<el mismo CRON_SECRET de Vercel>', 'cron_secret');
-- Sin esos dos secretos (por ejemplo, en local) los trabajos no hacen nada.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.cron_lanzar(p_tarea text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secreto text;
begin
  if p_tarea !~ '^[a-z-]+$' then
    raise exception 'tarea no válida';
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'cron_app_url';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secreto is null or length(v_secreto) < 16 then
    return null; -- sin configurar: no se lanza nada
  end if;

  return net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/' || p_tarea,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.cron_lanzar(text) from public, anon, authenticated;

-- cron.schedule con el mismo nombre sustituye el trabajo: la migración se puede repetir.
select cron.schedule('oficina-rutinas',                '0 * * * *',    $$select public.cron_lanzar('rutinas')$$);
select cron.schedule('oficina-control-calidad',        '5 * * * *',    $$select public.cron_lanzar('control-calidad')$$);
select cron.schedule('oficina-renovar-conexiones',     '*/15 * * * *', $$select public.cron_lanzar('renovar-conexiones')$$);
select cron.schedule('oficina-abrir-aplazadas',        '*/15 * * * *', $$select public.cron_lanzar('abrir-aplazadas')$$);
select cron.schedule('oficina-procesar-pendientes',    '*/5 * * * *',  $$select public.cron_lanzar('procesar-pendientes')$$);
select cron.schedule('oficina-examenes-certificacion', '*/5 * * * *',  $$select public.cron_lanzar('examenes-certificacion')$$);
