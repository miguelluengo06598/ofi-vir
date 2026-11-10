-- Reglas de agente en la base: tareas aplazadas (se reanudan solo cuando toca y una sola vez), avisos sin duplicar, consumo de créditos
-- por agente y mes, y que las funciones solo las llama el servidor. Ejecutar con: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Agente de la empresa A (semilla) y una tarea.
insert into public.agents (id, company_id, department_id, slug, name, role, creator_name)
values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3bd58844-d48e-4d17-aa9b-d45d078a606a', 'reglas-1', 'Reglas 1', 'Prueba', 'IDESIE');
insert into public.tasks (id, company_id, agent_id, title, model)
values ('bbbbbbbb-0000-4000-8000-0000000000e1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'Mensaje fuera de horario', 'claude-haiku-5-5');

-- 1) Permisos -------------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.tarea_reanudar_aplazada(uuid,uuid,timestamptz)', 'execute'), 'authenticated no reanuda tareas');
select ok(not has_function_privilege('authenticated', 'public.aviso_regla_agente(uuid,uuid,text,text,text,timestamptz)', 'execute'), 'authenticated no crea avisos de reglas');
select ok(not has_function_privilege('anon', 'public.agent_creditos_consumidos(uuid,uuid,timestamptz)', 'execute'), 'anon no lee el consumo');
select ok(has_function_privilege('service_role', 'public.tarea_reanudar_aplazada(uuid,uuid,timestamptz)', 'execute'), 'service_role sí');

-- 2) Aplazar: sin hora de reanudación no se puede -----------------------------------------------------------------------------------
select throws_ok($$update public.tasks set status = 'scheduled' where id = 'bbbbbbbb-0000-4000-8000-0000000000e1'$$, '23514', null, 'una tarea aplazada necesita su hora de reanudación');
update public.tasks set status = 'scheduled', aplazada_hasta = '2026-11-11 08:00:00+00', instruccion_aplazada = 'Responde al cliente.' where id = 'bbbbbbbb-0000-4000-8000-0000000000e1';

-- 3) Reanudar: no antes de la hora, y UNA sola vez -----------------------------------------------------------------------------------
select is((select count(*) from public.tarea_reanudar_aplazada('a64499d1-7f43-4a43-abc8-41a313dc4018', 'bbbbbbbb-0000-4000-8000-0000000000e1', '2026-11-10 22:30:00+00')), 0::bigint, 'a las 23:30 (Madrid) todavía no toca');
select is((select status::text from public.tasks where id = 'bbbbbbbb-0000-4000-8000-0000000000e1'), 'scheduled', 'y sigue aplazada');
select is((select count(*) from public.tarea_reanudar_aplazada('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000e1', '2026-11-11 08:00:00+00')), 0::bigint, 'otra empresa no puede reanudarla');
select is((select instruccion from public.tarea_reanudar_aplazada('a64499d1-7f43-4a43-abc8-41a313dc4018', 'bbbbbbbb-0000-4000-8000-0000000000e1', '2026-11-11 08:00:00+00')), 'Responde al cliente.', 'al abrir se reanuda y devuelve el mensaje guardado');
select is((select count(*) from public.tarea_reanudar_aplazada('a64499d1-7f43-4a43-abc8-41a313dc4018', 'bbbbbbbb-0000-4000-8000-0000000000e1', '2026-11-11 08:00:00+00')), 0::bigint, 'una segunda vez no la consigue nadie');

-- 4) Avisos: uno por agente, tipo y periodo ---------------------------------------------------------------------------------------------
select ok(public.aviso_regla_agente('a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'limite_mensajes_agente', 'Límite', 'Texto', now() - interval '1 day'), 'el primer aviso se crea');
select ok(not public.aviso_regla_agente('a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'limite_mensajes_agente', 'Límite', 'Texto', now() - interval '1 day'), 'el segundo del mismo día, no');
select lives_ok($$insert into public.notifications (company_id, tipo, titulo, cuerpo) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'lote_por_caducar', 't', 'c'), ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'conexion_caducada', 't', 'c')$$, 'los tipos de notificación anteriores siguen permitidos');

-- 5) Consumo de créditos por agente y mes ------------------------------------------------------------------------------------------------------
insert into public.credit_ledger (company_id, tipo, creditos, agent_id, concepto, creado_en)
values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'consumo', -10, 'aaaaaaaa-0000-4000-8000-0000000000e1', 'tarea_simple', '2026-11-03 10:00:00+00'),
       ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'consumo', -50, 'aaaaaaaa-0000-4000-8000-0000000000e1', 'tarea_experta', '2026-11-12 10:00:00+00'),
       ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'consumo', -99, 'aaaaaaaa-0000-4000-8000-0000000000e1', 'tarea_experta', '2026-10-30 10:00:00+00');
select is(public.agent_creditos_consumidos('a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000e1', '2026-11-01 00:00:00+00'), 60, 'suma el consumo de este agente desde el 1 de noviembre (sin el de octubre)');

select * from finish();
rollback;
