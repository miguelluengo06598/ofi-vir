-- Fase 2 · Permisos del servicio.
-- El servidor de Next.js usa la clave service_role (nunca llega al navegador). Esa clave se salta la RLS,
-- pero necesita permiso de tabla para leer y escribir: sin él, toda consulta del servidor da «permission denied».
-- anon y authenticated NO cambian: siguen con lo mínimo concedido en la migración de RLS.

grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;
