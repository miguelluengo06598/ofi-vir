-- Tests de las conexiones con aplicaciones externas: funciones solo para service_role, state de un solo uso, secreto en Vault
-- (se crea, se renueva, se borra), el candado de renovación y el aislamiento entre empresas. Ejecutar con: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into public.companies (id, name) values ('c0000000-0000-4000-8000-0000000000a1', 'Conex A'), ('c0000000-0000-4000-8000-0000000000b1', 'Conex B');
insert into auth.users (id, email) values ('c0000000-0000-4000-8000-0000000000c1', 'conex-a@test.example');
insert into public.users (id, company_id, full_name, email, role) values ('c0000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-0000000000a1', 'Ana', 'conex-a@test.example', 'owner');

-- 1) Las funciones no las puede llamar la empresa (authenticated) ni anon ----------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.conexion_guardar(uuid,uuid,text,text,text,jsonb,timestamptz,text)', 'execute'), 'authenticated no puede guardar conexiones');
select ok(not has_function_privilege('anon', 'public.conexion_desconectar(uuid,uuid)', 'execute'), 'anon no puede desconectar');
select ok(has_function_privilege('service_role', 'public.conexion_desconectar(uuid,uuid)', 'execute'), 'service_role sí');
select ok(not has_function_privilege('authenticated', 'public.leer_token_conexion(uuid,uuid)', 'execute'), 'authenticated no puede leer tokens');

-- 2) Guardar crea la conexión y el secreto a la vez ------------------------------------------------------------------------------
create temp table t (id uuid);
insert into t select public.conexion_guardar('c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000c1', 'demo', 'oauth2', 'Cuenta demo', '["cuenta.leer"]'::jsonb, now() + interval '1 hour', '{"v":1,"access_token":"AT-1"}');
select is((select estado from public.company_connections where id = (select id from t)), 'conectado', 'queda conectada');
select is(public.leer_token_conexion('c0000000-0000-4000-8000-0000000000a1', (select id from t)), '{"v":1,"access_token":"AT-1"}', 'el secreto se guarda en Vault y se lee con la función de servidor');
select is((select count(*) from vault.decrypted_secrets where decrypted_secret like '%AT-1%'), 1::bigint, 'hay un secreto en Vault');
select is(public.leer_token_conexion('c0000000-0000-4000-8000-0000000000b1', (select id from t)), null, 'otra empresa no lo lee con el id de la conexión');

-- 3) La base no deja una conexión «conectada» sin secreto ---------------------------------------------------------------------------
select throws_ok($$update public.company_connections set token_ref = null where id = (select id from t)$$, '23514', null, 'conectado sin token_ref se rechaza');
select throws_ok($$insert into public.company_connections (company_id, proveedor, estado) values ('c0000000-0000-4000-8000-0000000000a1', 'hubspot', 'conectado')$$, '23514', null, 'tampoco al insertar');
select throws_ok($$insert into public.company_connections (company_id, proveedor, estado) values ('c0000000-0000-4000-8000-0000000000a1', 'demo', 'desconectado')$$, '23505', null, 'una sola fila por empresa y proveedor');

-- 4) Renovar sustituye el secreto (el anterior se borra) y el candado impide renovar dos veces ---------------------------------------
select ok(public.conexion_reclamar_renovacion('c0000000-0000-4000-8000-0000000000a1', (select id from t), 30), 'el primero reclama el candado');
select ok(not public.conexion_reclamar_renovacion('c0000000-0000-4000-8000-0000000000a1', (select id from t), 30), 'el segundo no');
select public.conexion_actualizar_token('c0000000-0000-4000-8000-0000000000a1', (select id from t), '{"v":1,"access_token":"AT-2"}', now() + interval '1 hour');
select is((select count(*) from vault.decrypted_secrets where decrypted_secret like '%AT-1%' or decrypted_secret like '%AT-2%'), 1::bigint, 'tras renovar solo queda el secreto nuevo');

-- 5) Caducada: borra el secreto y avisa a la empresa (una notificación) ---------------------------------------------------------------
select ok(public.conexion_marcar_caducada('c0000000-0000-4000-8000-0000000000a1', (select id from t), 'Demo', 'refresh rechazado'), 'se marca caducada');
select is((select count(*) from public.notifications where company_id = 'c0000000-0000-4000-8000-0000000000a1' and tipo = 'conexion_caducada'), 1::bigint, 'y avisa a la empresa');

-- 6) Estado de OAuth de un solo uso y ligado a empresa/persona -----------------------------------------------------------------------
insert into public.oauth_states (nonce, company_id, user_id, proveedor, code_verifier, expira_en)
values ('c0000000-0000-4000-8000-0000000000d1', 'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000c1', 'demo', 'verif', now() + interval '10 minutes');
select is((select count(*) from public.conexion_consumir_estado('c0000000-0000-4000-8000-0000000000d1', 'c0000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-0000000000c1', 'demo')), 0::bigint, 'otra empresa no puede consumir el estado');
select is((select count(*) from public.conexion_consumir_estado('c0000000-0000-4000-8000-0000000000d1', 'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000c1', 'demo')), 1::bigint, 'la empresa y persona correctas sí, una vez');
select is((select count(*) from public.conexion_consumir_estado('c0000000-0000-4000-8000-0000000000d1', 'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000c1', 'demo')), 0::bigint, 'la segunda vez ya no');

select * from finish();
rollback;
