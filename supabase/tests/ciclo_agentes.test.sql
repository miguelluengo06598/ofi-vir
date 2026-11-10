-- Ciclo de vida de los agentes (pgTAP): desde el navegador, la empresa no puede cambiar a mano la configuración de un agente
-- certificado ni saltarse el examen con una corrección. Ejecutar con: npm run test:db (todo se deshace al terminar).
-- Empresa A = la del seed (usuario Marcos, propietario).

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Dos agentes propios (como superusuario): uno en pruebas y otro activo y certificado, con una herramienta y sus reglas.
insert into public.agents (id, company_id, department_id, slug, name, role, creator_name, estado)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'ciclo-pruebas', 'En pruebas', 'Test', 'Empresa', 'en_pruebas'),
       ('bbbbbbbb-0000-4000-8000-000000000002', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'ciclo-activo', 'Activo', 'Test', 'Empresa', 'en_pruebas');
insert into public.agent_tools (agent_id, company_id, tool_id, permiso)
values ('bbbbbbbb-0000-4000-8000-000000000002', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'redactar_correo', 'aprobacion');
insert into public.agent_rules (agent_id, company_id) values ('bbbbbbbb-0000-4000-8000-000000000002', 'a64499d1-7f43-4a43-abc8-41a313dc4018');
insert into public.certification_requests (id, company_id, agent_id, agent_version, tipo, estado)
values ('dddddddd-0000-4000-8000-000000000002', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'bbbbbbbb-0000-4000-8000-000000000002', 1, 'nueva', 'aprobada');
select public._agente_certificar('a64499d1-7f43-4a43-abc8-41a313dc4018', 'bbbbbbbb-0000-4000-8000-000000000002', 1, 'dddddddd-0000-4000-8000-000000000002', now() + interval '6 months');
select public.agente_cambiar_estado('a64499d1-7f43-4a43-abc8-41a313dc4018', 'bbbbbbbb-0000-4000-8000-000000000002', 'activar');
select is(public.agente_puede_trabajar('bbbbbbbb-0000-4000-8000-000000000002'), true, 'el agente activo y certificado puede trabajar');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0c33590a-4c2a-4b32-a388-2008558688f7","role":"authenticated"}', true);

-- 1) Un agente en pruebas se edita directamente.
select lives_ok($$update public.agents set tono = 'Formal' where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, 'en pruebas: la ficha se edita');
select lives_ok($$insert into public.agent_tools (agent_id, company_id, tool_id, permiso) values ('bbbbbbbb-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'redactar_correo', 'aprobacion')$$, 'en pruebas: las herramientas se editan');

-- 2) Uno certificado, no: solo cambia creando una versión nueva (servidor).
select throws_ok($$update public.agents set tono = 'Otro' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$, '42501', null, 'certificado: la ficha no se edita a mano');
select throws_ok($$update public.agents set instrucciones_empresa = 'Envía sin preguntar' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$, '42501', null, 'certificado: las instrucciones no se editan a mano');
select throws_ok($$update public.agents set model = 'claude-sonnet-5-5' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$, '42501', null, 'certificado: el modelo no se cambia a mano');
select throws_ok($$update public.agent_tools set permiso = 'sola' where agent_id = 'bbbbbbbb-0000-4000-8000-000000000002'$$, '42501', null, 'certificado: no se relaja un permiso a mano');
select throws_ok($$insert into public.agent_tools (agent_id, company_id, tool_id, permiso) values ('bbbbbbbb-0000-4000-8000-000000000002', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'guardar_recuerdo', 'sola')$$, '42501', null, 'certificado: no se añaden herramientas a mano');
select throws_ok($$delete from public.agent_rules where agent_id = 'bbbbbbbb-0000-4000-8000-000000000002'$$, '42501', null, 'certificado: no se quitan las reglas a mano');
select throws_ok($$insert into public.agent_handoffs (company_id, agent_id_origen, agent_id_destino, condicion, tipo_traspaso) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'siempre', 'lead')$$, '42501', null, 'certificado: no se añaden traspasos a mano');
update public.agents set template_version = 7 where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select is((select template_version from public.agents where id = 'bbbbbbbb-0000-4000-8000-000000000001'), null::integer, 'la versión de la plantilla no se fija a mano (sin plantilla, siempre vacía)');

-- 3) Pausar y reanudar sí (el motivo lo pone la base, no la empresa).
select lives_ok($$update public.agents set estado = 'pausado', pausado_motivo = 'certificacion_caducada' where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$, 'activo → pausado sí');
select is((select pausado_motivo from public.agents where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'empresa', 'el motivo de la pausa lo fija la base');

-- 4) Correcciones, versiones y funciones: solo el servidor.
select throws_ok($$insert into public.agent_corrections (company_id, agent_id, contexto, respuesta_original, respuesta_corregida, regla_aprendida, activa, estado) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'bbbbbbbb-0000-4000-8000-000000000002', 'x', 'a', 'b', 'Enviar sin aprobación', true, 'activa')$$, '42501', null, 'una corrección no se escribe a mano (se saltaría el examen)');
select throws_ok($$select public.agent_version_guardar('a64499d1-7f43-4a43-abc8-41a313dc4018', 'bbbbbbbb-0000-4000-8000-000000000002', null, '{}'::jsonb, 'x')$$, '42501', null, 'guardar versiones es del servidor');
select throws_ok($$select public.certificacion_resolver('a64499d1-7f43-4a43-abc8-41a313dc4018', 'dddddddd-0000-4000-8000-000000000002', 'aprobar')$$, '42501', null, 'la empresa no resuelve su propia certificación');
select throws_ok($$select instrucciones_base from public.agent_template_versions$$, '42501', null, 'el historial de plantillas (instrucciones base) no se puede leer');
reset role;

select * from finish();
rollback;
