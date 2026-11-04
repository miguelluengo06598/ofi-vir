-- Tests del motor de agentes: coste calculado por la base, pasos de tarea aislados por empresa, herramientas solo para el servidor,
-- borradores que nacen pendientes (nunca enviados) y borrado RGPD de tareas. Se deshace al terminar.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

create temp table ids as select
  'a64499d1-7f43-4a43-abc8-41a313dc4018'::uuid as company_a,
  'b0000000-0000-4000-8000-000000000001'::uuid as company_b,
  '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'::uuid as lucia,
  '3284e4bb-f1b6-4970-a406-41ca6176e2c5'::uuid as laura,
  '475a43fe-a454-4192-aa65-34dbdd28b35a'::uuid as marta,
  '0c33590a-4c2a-4b32-a388-2008558688f7'::uuid as marcos,
  '3bd58844-d48e-4d17-aa9b-d45d078a606a'::uuid as atencion,
  'd0000000-0000-4000-8000-0000000000d1'::uuid as task;
insert into public.companies (id, name) values ((select company_b from ids), 'Taller Delta');

-- Coste: 1 M de tokens de cada clase con la tarifa de Haiku (0,092 + 0,46 + 0,0092 + 0,115 €).
insert into public.tasks (id, company_id, agent_id, title, model, contact_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
  values ((select task from ids), (select company_a from ids), (select lucia from ids), 'Tarea de prueba', 'claude-haiku-5-5', (select laura from ids), 1000000, 1000000, 1000000, 1000000);
select is((select cost_eur from public.tasks where id = (select task from ids)), 0.676200::numeric, 'la base calcula el coste en euros con la tarifa del modelo (entrada, salida y caché)');
select is((select ai_cost_credits from public.tasks where id = (select task from ids)), 600.0000::numeric, 'y el coste en créditos (la caché no suma créditos de entrada)');
update public.tasks set output_tokens = 0 where id = (select task from ids);
select is((select cost_eur from public.tasks where id = (select task from ids)), 0.216200::numeric, 'al cambiar los tokens, el coste se recalcula');

update public.tasks set extra_cost_eur = 0.01 where id = (select task from ids);
select is((select cost_eur from public.tasks where id = (select task from ids)), 0.226200::numeric, 'el coste del paso de memoria (Haiku) se suma al de la tarea');

-- Un recuerdo conserva su rastro aunque se borre la tarea que lo originó: solo pierde el enlace.
insert into public.tasks (id, company_id, agent_id, title, model) values ('d0000000-0000-4000-8000-0000000000d2', (select company_a from ids), (select lucia from ids), 'Otra', 'claude-haiku-5-5');
insert into public.memory_nodes (id, company_id, node_type, title, source_task_id, confidence, created_by_agent_id)
  values ('d0000000-0000-4000-8000-0000000000e1', (select company_a from ids), 'dato', 'Hecho: de prueba', 'd0000000-0000-4000-8000-0000000000d2', 0.8, (select lucia from ids));
delete from public.tasks where id = 'd0000000-0000-4000-8000-0000000000d2';
select ok((select source_task_id is null and company_id = (select company_a from ids) and confidence = 0.8 from public.memory_nodes where id = 'd0000000-0000-4000-8000-0000000000e1'),
  'al borrar la tarea, el recuerdo se conserva (con su confianza) y solo pierde el enlace');

insert into public.task_steps (company_id, task_id, position, step, kind, content) values
  ((select company_a from ids), (select task from ids), 0, 0, 'instruccion', 'Lead ficticio'),
  ((select company_a from ids), (select task from ids), 1, 1, 'respuesta', 'Busco en memoria');
select throws_ok(
  format($q$insert into public.task_steps (company_id, task_id, position, kind) values (%L, %L, 1, 'fin')$q$, (select company_a from ids), (select task from ids)),
  '23505', null, 'la posición de un paso es única: así solo una ejecución puede reservar la tarea');

-- RLS: cada empresa ve solo los pasos de sus tareas; el navegador no escribe pasos.
create schema tests;
create function tests.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant usage on schema tests to authenticated;
grant execute on function tests.act_as(uuid) to authenticated;
select ok(true, 'pgTAP está listo');
grant all on sequence __tresults___numb_seq to public;
grant all on table __tcache__ to public;

select tests.act_as((select marcos from ids));
select is((select count(*)::int from public.task_steps), 2, 'Marcos (empresa A) ve los pasos de su tarea');
select throws_ok(
  $q$insert into public.task_steps (company_id, task_id, position, kind) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'd0000000-0000-4000-8000-0000000000d1', 9, 'fin')$q$,
  '42501', null, 'el navegador no puede escribir pasos');
select throws_ok(
  $q$select * from public.agent_create_email_draft('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'x', 'y')$q$,
  '42501', null, 'el navegador no puede crear borradores de agente');
select throws_ok(
  $q$select * from public.agent_create_handoff('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', '3bd58844-d48e-4d17-aa9b-d45d078a606a', 'aviso', 'x', '[]')$q$,
  '42501', null, 'el navegador no puede crear traspasos de agente');
reset role;

select tests.act_as('ee000000-0000-4000-8000-0000000000ee');
select is((select count(*)::int from public.task_steps), 0, 'alguien sin empresa no ve ningún paso');
reset role;

-- Borrador del agente: nace pendiente, con su aprobación, y NO se puede enviar sin aprobar.
create temp table d1 as select * from public.agent_create_email_draft(
  (select company_a from ids), (select lucia from ids), (select laura from ids), 'Asunto de prueba', 'Cuerpo de prueba');
select is((select reused from d1), false, 'el borrador se crea');
select is((select a.status::text from public.approvals a where a.id = (select approval_id from d1)), 'pending', 'su aprobación nace pendiente');
select is((select a.payload ->> 'origen' from public.approvals a where a.id = (select approval_id from d1)), 'motor', 'y marca su origen (lo redactó un agente)');
select is((select e.delivery_status::text from public.emails e where e.id = (select email_id from d1)), 'pending_approval', 'el correo queda «pendiente de aprobación»');
select is((select reused from public.agent_create_email_draft((select company_a from ids), (select lucia from ids), (select laura from ids), 'Asunto de prueba', 'Cuerpo de prueba')), true,
  'repetir el mismo borrador reutiliza el existente');
select throws_ok(
  format($q$update public.emails set delivery_status = 'sent' where id = %L$q$, (select email_id from d1)),
  '23514', 'Correo saliente sin aprobación registrada', 'la base no deja enviar un borrador de agente sin aprobación');
select throws_ok(
  format($q$select * from public.agent_create_email_draft(%L, %L, %L, 'x', 'y')$q$, (select company_b from ids), (select lucia from ids), (select laura from ids)),
  'P0002', null, 'una empresa no puede redactar con agentes ni contactos de otra');

-- Traspaso: lo recibe un agente disponible del departamento de destino.
select is((select to_agent_name from public.agent_create_handoff((select company_a from ids), (select lucia from ids), (select atencion from ids), 'aviso', 'Duda de facturación', '[]'::jsonb)), 'Hugo Lara'::text,
  'el traspaso lo recibe un agente del departamento de destino');

-- RGPD: borrar al contacto borra sus tareas y todos sus pasos.
select public.erase_contact((select company_a from ids), (select laura from ids), 'prueba');
select is((select count(*)::int from public.tasks where id = (select task from ids)) + (select count(*)::int from public.task_steps where task_id = (select task from ids)), 0,
  'borrar al contacto borra su tarea y los pasos (datos personales incluidos)');

select * from finish();
rollback;
