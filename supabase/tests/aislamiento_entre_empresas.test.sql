-- Tests de aislamiento entre empresas y de las reglas de correo (pgTAP).
-- Ejecutar con: npm run test:db  (necesita Supabase arrancado; todo se deshace al terminar).
--
-- Empresa A = la del seed (Hogar Mediterráneo; usuario Marcos, propietario).
-- Empresa B = "Taller Delta", creada aquí. Usuarias: Diana (miembro de B), Lola (miembro de A) y un creador de agentes sin empresa.

begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

create schema tests;
grant usage on schema tests to anon, authenticated;

-- Ids del seed (empresa A).
create function tests.company_a() returns uuid language sql as $$ select 'a64499d1-7f43-4a43-abc8-41a313dc4018'::uuid $$;
create function tests.marcos() returns uuid language sql as $$ select '0c33590a-4c2a-4b32-a388-2008558688f7'::uuid $$;
create function tests.dept_a() returns uuid language sql as $$ select '36be8074-504e-4ef4-aa98-135ad3e9acb0'::uuid $$;
create function tests.lucia() returns uuid language sql as $$ select '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'::uuid $$;
create function tests.laura() returns uuid language sql as $$ select '3284e4bb-f1b6-4970-a406-41ca6176e2c5'::uuid $$;
create function tests.node_laura() returns uuid language sql as $$ select '256528b3-b159-457c-ad5e-b85ea46882f5'::uuid $$;
create function tests.approval_a() returns uuid language sql as $$ select '451c5e13-ab4e-47d4-a16f-d2ff95f6b5bc'::uuid $$;
-- Ids de la empresa B.
create function tests.company_b() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.diana() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-0000000000d1'::uuid $$;
create function tests.lola() returns uuid language sql as $$ select 'a0000000-0000-4000-8000-0000000000a1'::uuid $$;
create function tests.creator() returns uuid language sql as $$ select 'c0000000-0000-4000-8000-0000000000c1'::uuid $$;
create function tests.dept_b() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-000000000002'::uuid $$;
create function tests.agent_b() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-000000000003'::uuid $$;
create function tests.contact_b() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-000000000004'::uuid $$;
create function tests.node_b() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-000000000005'::uuid $$;
create function tests.node_b2() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-000000000006'::uuid $$;
create function tests.approval_b() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-000000000007'::uuid $$;
grant execute on all functions in schema tests to anon, authenticated;

-- Ejecuta una sentencia de escritura con el rol actual y devuelve cuántas filas ha tocado (la RLS filtra, no falla).
create function tests.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function tests.affected(text) to anon, authenticated;

-- Simula a una persona con sesión: el rol `authenticated` con su id en el JWT (lo que lee auth.uid()).
create function tests.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

-- pgTAP escribe sus resultados en tablas temporales (se crean con la primera aserción): hay que dejar que los roles simulados las usen.
select ok(true, 'pgTAP está listo');
grant all on sequence __tresults___numb_seq to public;
grant all on table __tcache__ to public;
grant all on sequence __tcache___id_seq to public;

-- ——— Datos de las empresas B, un miembro de A y un creador sin empresa (como superusuario) ———
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', tests.diana(), 'authenticated', 'authenticated', 'diana@tallerdelta.example', now(), now()),
  ('00000000-0000-0000-0000-000000000000', tests.lola(), 'authenticated', 'authenticated', 'lola@hogarmediterraneo.example', now(), now()),
  ('00000000-0000-0000-0000-000000000000', tests.creator(), 'authenticated', 'authenticated', 'creador@estudiocalamo.example', now(), now());
insert into public.companies (id, name) values (tests.company_b(), 'Taller Delta');
insert into public.users (id, full_name, email) values
  (tests.diana(), 'Diana Ferrer', 'diana@tallerdelta.example'),
  (tests.lola(), 'Lola Marín', 'lola@hogarmediterraneo.example');
insert into public.company_members (company_id, user_id, rol) values
  (tests.company_b(), tests.diana(), 'propietario'),
  (tests.company_a(), tests.lola(), 'miembro');
insert into public.departments (id, company_id, slug, name) values (tests.dept_b(), tests.company_b(), 'ventas', 'Ventas');
insert into public.agents (id, company_id, department_id, slug, name, role, creator_name) values
  (tests.agent_b(), tests.company_b(), tests.dept_b(), 'rosa-agent', 'Rosa Agente', 'Ventas', 'Estudio Cálamo');
insert into public.contacts (id, company_id, name, email) values (tests.contact_b(), tests.company_b(), 'Cliente de Delta', 'cliente@delta.example');
insert into public.email_threads (id, company_id, contact_id, agent_id, subject) values
  ('b0000000-0000-4000-8000-000000000008', tests.company_b(), tests.contact_b(), tests.agent_b(), 'Presupuesto Delta');
insert into public.emails (company_id, thread_id, direction, from_address, to_address, subject, body, delivery_status) values
  (tests.company_b(), 'b0000000-0000-4000-8000-000000000008', 'inbound', 'cliente@delta.example', 'rosa@delta.example', 'Presupuesto', 'Hola', 'received');
insert into public.approvals (id, company_id, agent_id, kind, title, payload) values
  (tests.approval_b(), tests.company_b(), tests.agent_b(), 'email', 'Enviar presupuesto', '{"subject":"Presupuesto","body":"Hola"}');
-- Toda tarea tiene origen: aquí, un mensaje que llegó de fuera.
with e as (insert into public.eventos_externos (company_id, canal, estado) values (tests.company_b(), 'whatsapp', 'aceptado') returning id)
insert into public.tasks (company_id, agent_id, title, model, origen, evento_id) select tests.company_b(), tests.agent_b(), 'Tarea de Delta', 'claude-haiku-5-5', 'evento_externo', e.id from e;
insert into public.handoff_chains (company_id, title, goal) values (tests.company_b(), 'Cadena Delta', 'Objetivo');
insert into public.memory_nodes (id, company_id, contact_id, node_type, title, created_by_agent_id, embedding) values
  (tests.node_b(), tests.company_b(), tests.contact_b(), 'contacto', 'Cliente de Delta', tests.agent_b(), array_fill(0.5::real, array[1024])::extensions.vector),
  (tests.node_b2(), tests.company_b(), tests.contact_b(), 'empresa', 'Delta', tests.agent_b(), null);
insert into public.memory_edges (company_id, from_node_id, to_node_id, kind, created_by_agent_id)
  values (tests.company_b(), tests.node_b(), tests.node_b2(), 'trabaja_en', tests.agent_b());
-- Un vector parecido en la empresa A, para la búsqueda semántica.
update public.memory_nodes set embedding = array_fill(0.5::real, array[1024])::extensions.vector where id = tests.node_laura();

-- ——— 1. Marcos (empresa A): no ve nada de B, y sí lo suyo ———
select tests.act_as(tests.marcos());

select is((select count(*) from public.companies where id <> tests.company_a()), 0::bigint, 'A no ve otras empresas');
select is((select count(*) from public.company_members where company_id <> tests.company_a()), 0::bigint, 'A no ve miembros de B');
select is((select count(*) from public.departments where company_id <> tests.company_a()), 0::bigint, 'A no ve departamentos de B');
select is((select count(*) from public.agents where company_id <> tests.company_a()), 0::bigint, 'A no ve agentes de B');
select is((select count(*) from public.contacts where company_id <> tests.company_a()), 0::bigint, 'A no ve contactos de B');
select is((select count(*) from public.email_threads where company_id <> tests.company_a()), 0::bigint, 'A no ve hilos de B');
select is((select count(*) from public.emails where company_id <> tests.company_a()), 0::bigint, 'A no ve correos de B');
select is((select count(*) from public.approvals where company_id <> tests.company_a()), 0::bigint, 'A no ve aprobaciones de B');
select is((select count(*) from public.tasks where company_id <> tests.company_a()), 0::bigint, 'A no ve tareas de B');
select is((select count(*) from public.handoff_chains where company_id <> tests.company_a()), 0::bigint, 'A no ve cadenas de B');
select is((select count(*) from public.handoffs where company_id <> tests.company_a()), 0::bigint, 'A no ve traspasos de B');
select is((select count(*) from public.memory_nodes where company_id <> tests.company_a()), 0::bigint, 'A no ve nodos de memoria de B');
select is((select count(*) from public.memory_edges where company_id <> tests.company_a()), 0::bigint, 'A no ve conexiones de memoria de B');

select is((select count(*) from public.agents), 10::bigint, 'A ve sus 10 agentes');
select is((select count(*) from public.contacts), 3::bigint, 'A ve sus 3 contactos');
select is((select count(*) from public.memory_nodes), 43::bigint, 'A ve sus 43 nodos de memoria');

-- Acceso directo por id a una fila de B: nada.
select is((select count(*) from public.contacts where id = tests.contact_b()), 0::bigint, 'A no puede leer un contacto de B ni conociendo su id');

-- Escribir en B: no afecta a ninguna fila.
select is(tests.affected($q$update public.contacts set name = 'Hackeado' where id = tests.contact_b()$q$), 0::bigint, 'A no puede modificar un contacto de B');
select is(tests.affected($q$delete from public.memory_nodes where id = tests.node_b()$q$), 0::bigint, 'A no puede borrar un nodo de B');
select is(tests.affected($q$update public.approvals set status = 'rejected' where id = tests.approval_b()$q$), 0::bigint, 'A no puede decidir una aprobación de B');
select throws_ok($$insert into public.contacts (company_id, name, email) values (tests.company_b(), 'Intruso', 'i@x.example')$$, '42501', null, 'A no puede crear un contacto en B');
select throws_ok($$update public.contacts set company_id = tests.company_b() where id = tests.laura()$$, '42501', null, 'A no puede pasarle un contacto suyo a B');

-- Integridad entre empresas: ni siquiera dentro de la propia empresa se puede apuntar a datos de otra.
select throws_ok($$insert into public.memory_edges (company_id, from_node_id, to_node_id, kind, created_by_user_id) values (tests.company_a(), tests.node_laura(), tests.node_b(), 'trabaja_en', tests.marcos())$$, '23503', null, 'Una conexión de A no puede apuntar a un nodo de B');
select throws_ok($$insert into public.agents (company_id, department_id, slug, name, role, creator_name) values (tests.company_a(), tests.dept_b(), 'x', 'X', 'X', 'X')$$, '23503', null, 'Un agente de A no puede colgar de un departamento de B');

-- Búsqueda semántica: la RLS también la limita.
select is((select count(*) from public.match_memory_nodes(array_fill(0.5::real, array[1024])::extensions.vector, 50) where id = tests.node_b()), 0::bigint, 'La búsqueda semántica de A no devuelve nodos de B');
select is((select count(*) from public.match_memory_nodes(array_fill(0.5::real, array[1024])::extensions.vector, 50) where id = tests.node_laura()), 1::bigint, 'La búsqueda semántica de A sí devuelve los suyos');

-- Borrar todo lo de un contacto borra sus nodos y conexiones (y solo los suyos).
select is((select count(*) from public.memory_nodes where contact_id = tests.laura()), 16::bigint, 'Laura tiene 16 nodos');
select lives_ok($$delete from public.contacts where id = tests.laura()$$, 'A puede borrar un contacto suyo');
select is((select count(*) from public.memory_nodes where contact_id = tests.laura()), 0::bigint, 'Sus nodos se borran con él');
select is((select count(*) from public.memory_nodes), 27::bigint, 'Los demás clientes de A siguen intactos');

select tests.act_as(tests.marcos());
-- Los creadores/usuarios sin empresa no existen para la RLS (ver más abajo). Aquí: reglas de rol dentro de A.
select lives_ok($$insert into public.departments (company_id, slug, name) values (tests.company_a(), 'soporte', 'Soporte')$$, 'Un propietario puede crear departamentos');

-- ——— 2. Lola (miembro de A): lee, pero no administra ———
select tests.act_as(tests.lola());
select is((select count(*) from public.agents), 10::bigint, 'Un miembro ve los agentes de su empresa');
select throws_ok($$insert into public.departments (company_id, slug, name) values (tests.company_a(), 'x', 'X')$$, '42501', null, 'Un miembro no puede crear departamentos');
select is(tests.affected($q$update public.agents set daily_email_limit = 999 where company_id = tests.company_a()$q$), 0::bigint, 'Un miembro no puede cambiar el límite de correos de un agente');
select is(tests.affected($q$update public.approvals set status = 'approved' where id = tests.approval_a()$q$), 0::bigint, 'Un miembro SIN permiso de aprobar no decide aprobaciones');
reset role;
update public.company_members set puede_aprobar = true where company_id = tests.company_a() and user_id = tests.lola();
select tests.act_as(tests.lola());
select is(tests.affected($q$update public.approvals set status = 'approved' where id = tests.approval_a()$q$), 1::bigint, 'Un miembro CON permiso de aprobar sí decide una aprobación de su empresa');
select throws_ok($$insert into public.emails (company_id, thread_id, direction, from_address, to_address, subject, body, delivery_status) values (tests.company_a(), (select id from public.email_threads limit 1), 'inbound', 'a@x.example', 'b@x.example', 's', 'b', 'received')$$, '42501', null, 'Las personas no escriben correos directamente (solo el servidor)');

-- ——— 3. Diana (empresa B): ve solo lo suyo ———
select tests.act_as(tests.diana());
select is((select count(*) from public.agents), 1::bigint, 'B ve solo su agente');
select is((select count(*) from public.agents where company_id = tests.company_a()), 0::bigint, 'B no ve ningún agente de A');
select is((select count(*) from public.emails where company_id = tests.company_a()), 0::bigint, 'B no ve ningún correo de A');
select is((select count(*) from public.memory_nodes where company_id = tests.company_a()), 0::bigint, 'B no ve ningún nodo de memoria de A');
select is((select count(*) from public.tasks where company_id = tests.company_a()), 0::bigint, 'B no ve ninguna tarea de A');

-- ——— 4. Un creador de agentes (sin empresa) y el anónimo: nada ———
select tests.act_as(tests.creator());
select is((select count(*) from public.agents) + (select count(*) from public.contacts) + (select count(*) from public.emails)
        + (select count(*) from public.memory_nodes) + (select count(*) from public.approvals) + (select count(*) from public.tasks), 0::bigint, 'Un creador de agentes no ve datos de ninguna empresa');
select tests.act_as_anon();
select throws_ok($$select * from public.agents$$, '42501', null, 'Sin sesión no se puede leer ni la tabla');

-- ——— 5. Reglas de correo (disparadores; aplican también al servidor) ———
reset role;
insert into public.email_threads (id, company_id, contact_id, agent_id, subject) values
  ('b0000000-0000-4000-8000-000000000009', tests.company_b(), tests.contact_b(), tests.agent_b(), 'Hilo de pruebas');
update public.agents set daily_email_limit = 1 where id = tests.agent_b();

select throws_ok(
  $$insert into public.emails (company_id, thread_id, direction, from_address, to_address, subject, body, delivery_status)
    values (tests.company_b(), 'b0000000-0000-4000-8000-000000000009', 'outbound', 'rosa@delta.example', 'cliente@delta.example', 'Hola', 'Texto', 'sent')$$,
  '23514', 'Correo saliente sin aprobación registrada', 'No se registra un correo enviado sin aprobación');

select throws_ok(
  $$insert into public.approvals (company_id, agent_id, kind, title, payload, status, decided_by, decided_at)
    values (tests.company_b(), tests.agent_b(), 'email', 'x', '{}', 'approved', tests.diana(), now())$$,
  '23514', 'Una aprobación debe crearse como pendiente', 'Una aprobación no puede nacer ya aprobada');

-- Aprobación real: se crea pendiente y la decide Diana.
insert into public.approvals (id, company_id, agent_id, kind, title, payload) values
  ('b0000000-0000-4000-8000-00000000000a', tests.company_b(), tests.agent_b(), 'email', 'Enviar «Hola»',
   '{"subject":"Hola","body":"Texto aprobado"}');
select tests.act_as(tests.diana());
select is(tests.affected($q$update public.approvals set status = 'approved', decided_by = tests.diana() where id = 'b0000000-0000-4000-8000-00000000000a'$q$), 1::bigint, 'Diana aprueba el borrador');
reset role;
select is((select content_sha256 from public.approvals where id = 'b0000000-0000-4000-8000-00000000000a'), public.email_content_hash('Hola', 'Texto aprobado'), 'La aprobación guarda la huella del texto aprobado');

select throws_ok($$update public.approvals set payload = '{"subject":"Hola","body":"Otro texto"}' where id = 'b0000000-0000-4000-8000-00000000000a'$$, '23514', null, 'Una aprobación resuelta no se puede modificar');

select throws_ok(
  $$insert into public.emails (company_id, thread_id, direction, from_address, to_address, subject, body, delivery_status, approval_id)
    values (tests.company_b(), 'b0000000-0000-4000-8000-000000000009', 'outbound', 'rosa@delta.example', 'cliente@delta.example', 'Hola', 'Texto DISTINTO', 'sent', 'b0000000-0000-4000-8000-00000000000a')$$,
  '23514', 'El texto del correo no coincide con el aprobado', 'No se envía un texto distinto del aprobado');

select lives_ok(
  $$insert into public.emails (company_id, thread_id, direction, from_address, to_address, subject, body, delivery_status, approval_id)
    values (tests.company_b(), 'b0000000-0000-4000-8000-000000000009', 'outbound', 'rosa@delta.example', 'cliente@delta.example', 'Hola', 'Texto aprobado', 'sent', 'b0000000-0000-4000-8000-00000000000a')$$,
  'Con aprobación y el texto exacto, el correo se registra');

-- Límite diario (1): el segundo envío del día, aunque esté aprobado, se rechaza.
insert into public.approvals (id, company_id, agent_id, kind, title, payload) values
  ('b0000000-0000-4000-8000-00000000000b', tests.company_b(), tests.agent_b(), 'email', 'Segundo', '{"subject":"Otro","body":"Segundo correo"}');
update public.approvals set status = 'approved', decided_by = tests.diana() where id = 'b0000000-0000-4000-8000-00000000000b';
select throws_ok(
  $$insert into public.emails (company_id, thread_id, direction, from_address, to_address, subject, body, delivery_status, approval_id)
    values (tests.company_b(), 'b0000000-0000-4000-8000-000000000009', 'outbound', 'rosa@delta.example', 'cliente@delta.example', 'Otro', 'Segundo correo', 'sent', 'b0000000-0000-4000-8000-00000000000b')$$,
  '23514', null, 'Se respeta el límite diario de correos del agente');

-- Una aprobación de otra empresa no vale.
select throws_ok(
  $$insert into public.emails (company_id, thread_id, direction, from_address, to_address, subject, body, delivery_status, approval_id)
    values (tests.company_b(), 'b0000000-0000-4000-8000-000000000009', 'outbound', 'rosa@delta.example', 'cliente@delta.example', 'Hola', 'Texto', 'sent', tests.approval_a())$$,
  '23514', 'Correo saliente sin aprobación registrada', 'Un correo de B no puede usar una aprobación de A');

-- ——— 6. Coste calculado de las tareas ———
with e as (insert into public.eventos_externos (company_id, canal, estado) values (tests.company_b(), 'whatsapp', 'aceptado') returning id)
insert into public.tasks (id, company_id, agent_id, title, model, input_tokens, output_tokens, creator_fee_credits, origen, evento_id)
  select 'b0000000-0000-4000-8000-00000000000c', tests.company_b(), tests.agent_b(), 'Coste', 'claude-haiku-5-5', 1000000, 1000000, 2, 'evento_externo', e.id from e;
select is((select ai_cost_credits from public.tasks where id = 'b0000000-0000-4000-8000-00000000000c'), 600.0000::numeric, 'Coste de IA = tokens × tarifa del modelo (100 + 500 créditos)');
select is((select cost_credits from public.tasks where id = 'b0000000-0000-4000-8000-00000000000c'), 602.0000::numeric, 'Coste total = IA + tarifa del creador');
update public.tasks set model = 'claude-sonnet-5-5' where id = 'b0000000-0000-4000-8000-00000000000c';
select is((select ai_cost_credits from public.tasks where id = 'b0000000-0000-4000-8000-00000000000c'), 1800.0000::numeric, 'Al cambiar de modelo se recalcula (300 + 1500 créditos)');

select * from finish();
rollback;
