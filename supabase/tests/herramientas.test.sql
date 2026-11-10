-- Tests de las tablas del catálogo de herramientas (pgTAP): registro de llamadas, tareas para humanos y traspaso a un agente.
-- Ejecutar con: npm run test:db (todo se deshace al terminar). Empresa A = la del seed (Marcos, propietario; Lucía y Daniel en Ventas).

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Datos (como superusuario): una aprobación y una llamada pendiente de Lucía.
insert into public.approvals (id, company_id, agent_id, kind, title, payload)
values ('eeeeeeee-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'other', 'Prueba', '{}');
insert into public.tool_calls (company_id, agent_id, tool_id, resultado, permiso, approval_id)
values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'crear_cita', 'pendiente_aprobacion', 'aprobacion', 'eeeeeeee-0000-4000-8000-000000000001');
insert into public.human_tasks (id, company_id, agent_id, titulo, contexto)
values ('ffffffff-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'Caso delicado', 'Contexto original');

-- Una aprobación se consume una sola vez.
select lives_ok($$insert into public.tool_calls (company_id, agent_id, tool_id, resultado, approval_id) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'crear_cita', 'aprobada', 'eeeeeeee-0000-4000-8000-000000000001')$$, 'la primera vez se consume');
select throws_ok($$insert into public.tool_calls (company_id, agent_id, tool_id, resultado, approval_id) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'crear_cita', 'aprobada', 'eeeeeeee-0000-4000-8000-000000000001')$$, '23505', null, 'la segunda vez no');

-- Un traspaso siempre nace de una tarea del agente origen (con su propio origen).
insert into public.tasks (id, company_id, agent_id, title, model, origen, ordenado_por)
values ('cccccccc-0000-4000-8000-0000000000a1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'Origen del traspaso', 'claude-haiku-5-5', 'orden_usuario', '0c33590a-4c2a-4b32-a388-2008558688f7');
insert into public.tasks (id, company_id, agent_id, title, model, origen, ordenado_por)
values ('cccccccc-0000-4000-8000-0000000000a2', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 'Origen del traspaso inverso', 'claude-haiku-5-5', 'orden_usuario', '0c33590a-4c2a-4b32-a388-2008558688f7');
-- Traspaso a un agente concreto: solo si la empresa lo configuró.
select throws_ok($$select * from public.agent_traspaso_crear('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 'lead', 'lead', 'x', '{}'::jsonb, '{}'::jsonb, 'h-'||gen_random_uuid()::text, null, 'cccccccc-0000-4000-8000-0000000000a1', 'x', 6, 1)$$, '42501', null, 'sin traspaso configurado, la base lo rechaza');
insert into public.agent_handoffs (company_id, agent_id_origen, agent_id_destino, condicion, tipo_traspaso)
values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 'lead cualificado', 'lead');
select is((public.agent_traspaso_crear('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 'lead', 'lead', 'x', '{}'::jsonb, '{}'::jsonb, 'h-'||gen_random_uuid()::text, null, 'cccccccc-0000-4000-8000-0000000000a1', 'x', 6, 1))->>'to_agent_name', 'Daniel Prieto', 'con el traspaso configurado, llega a ese agente y no a otro del departamento');
select throws_ok($$select * from public.agent_traspaso_crear('a64499d1-7f43-4a43-abc8-41a313dc4018', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'lead', 'lead', 'x', '{}'::jsonb, '{}'::jsonb, 'h-'||gen_random_uuid()::text, null, 'cccccccc-0000-4000-8000-0000000000a2', 'x', 6, 1)$$, '42501', null, 'el traspaso inverso no está configurado');

-- Marcos (propietario de A).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0c33590a-4c2a-4b32-a388-2008558688f7","role":"authenticated"}', true);
select is((select count(*) from public.tool_calls), 2::bigint, 'la empresa lee su registro de llamadas');
select throws_ok($$insert into public.tool_calls (company_id, agent_id, tool_id, resultado) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'x', 'ok')$$, '42501', null, 'no puede escribir en el registro');
select throws_ok($$select public.agent_traspaso_crear('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 'lead', 'lead', 'x', '{}'::jsonb, '{}'::jsonb, 'h-'||gen_random_uuid()::text, null, 'cccccccc-0000-4000-8000-0000000000a1', 'x', 6, 1)$$, '42501', null, 'no puede llamar a la función de traspaso');
select lives_ok($$update public.human_tasks set estado = 'resuelta', resuelta_en = now()$$, 'puede marcar una tarea para el equipo como resuelta');
select throws_ok($$update public.human_tasks set contexto = 'cambiado'$$, '42501', null, 'pero no reescribir su contexto');
reset role;

-- Alguien sin empresa (el equipo interno de IDESIE) no ve nada de A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1de51e00-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select count(*) from public.tool_calls) + (select count(*) from public.human_tasks), 0::bigint, 'otra empresa no ve registros ni tareas de A');
reset role;

select * from finish();
rollback;
