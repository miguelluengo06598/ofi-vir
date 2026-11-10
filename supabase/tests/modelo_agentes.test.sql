-- Tests del modelo de agentes (pgTAP): instrucciones base protegidas, certificación solo desde el servidor,
-- tokens en Vault y agente_puede_trabajar. Ejecutar con: npm run test:db (todo se deshace al terminar).
-- Empresa A = la del seed (usuario Marcos, propietario; agente Lucía en el departamento de Ventas).

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Datos de prueba (como superusuario): una plantilla con instrucciones secretas y una certificación.
insert into public.agent_templates (id, nombre_por_defecto, rol, departamento_tipo, descripcion_publica, instrucciones_base, herramientas_disponibles)
values ('plantilla-test', 'Test', 'Seguimiento', 'ventas', 'Pública', 'SECRETO-DE-IDESIE',
  '[{"id":"redactar_correo","permiso_defecto":"aprobacion","editable":false},{"id":"buscar_en_memoria","permiso_defecto":"sola","editable":true}]');
insert into public.template_certifications (template_id, template_version, caduca_en, es_dato_de_prueba)
values ('plantilla-test', 1, now() + interval '6 months', true);
insert into public.agents (id, company_id, department_id, slug, name, role, creator_name, template_id)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'plantilla-agente', 'Agente plantilla', 'Test', 'IDESIE', 'plantilla-test');
insert into public.company_connections (id, company_id, proveedor, cuenta_externa, estado)
values ('cccccccc-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'hubspot', 'Cuenta de prueba', 'desconectado');

-- Lucía empieza estas pruebas en borrador y sin certificar, tenga lo que tenga la base local (p. ej. la certificación de prueba del seed).
delete from public.certifications where agent_id = '0e9902f1-d636-4806-a597-7d1d4bf9e7b4';
update public.agents set estado = 'borrador', version_certificada = null, certificado_hasta = null where id = '0e9902f1-d636-4806-a597-7d1d4bf9e7b4';

-- 1) instrucciones_base ---------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0c33590a-4c2a-4b32-a388-2008558688f7","role":"authenticated"}', true);
select throws_ok($$select instrucciones_base from public.agent_templates$$, '42501', null, 'la tabla agent_templates no se puede leer (ni la columna)');
select throws_ok($$select * from public.agent_templates_public where false and instrucciones_base is null$$, '42703', null, 'la vista pública no tiene la columna instrucciones_base');
select is((select count(*) from public.agent_templates_public where id = 'plantilla-test'), 1::bigint, 'la vista pública sí muestra la plantilla');
select throws_ok($$update public.agent_templates set activa = false$$, '42501', null, 'una empresa no edita plantillas');
reset role;

-- 2) Una empresa no se certifica a sí misma ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0c33590a-4c2a-4b32-a388-2008558688f7","role":"authenticated"}', true);
select throws_ok($$update public.agents set estado = 'activo' where id = '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'$$, '42501', null, 'borrador → activo prohibido');
select throws_ok($$update public.agents set estado = 'certificado' where id = '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'$$, '42501', null, 'borrador → certificado prohibido');
select throws_ok($$update public.agents set version_certificada = 1, certificado_hasta = now() + interval '1 year' where id = '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'$$, '42501', null, 'no puede fijar su versión certificada');
select throws_ok($$insert into public.agents (company_id, department_id, slug, name, role, estado) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'x', 'X', 'X', 'activo')$$, '42501', null, 'no puede crear un agente ya activo');
select lives_ok($$update public.agents set estado = 'en_pruebas' where id = '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'$$, 'borrador → en_pruebas sí');
select throws_ok($$insert into public.certifications (company_id, agent_id, agent_version, request_id, caduca_en) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 1, gen_random_uuid(), now() + interval '1 year')$$, '42501', null, 'no puede escribir certificaciones');
-- Herramientas de una plantilla: solo las que ofrece y solo editables.
select throws_ok($$insert into public.agent_tools (agent_id, company_id, tool_id, permiso) values ('aaaaaaaa-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'redactar_correo', 'sola')$$, '42501', null, 'no puede relajar un permiso no editable');
select throws_ok($$insert into public.agent_tools (agent_id, company_id, tool_id, permiso) values ('aaaaaaaa-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'herramienta_inventada', 'sola')$$, '42501', null, 'no puede añadir herramientas que la plantilla no ofrece');
select lives_ok($$insert into public.agent_tools (agent_id, company_id, tool_id, permiso) values ('aaaaaaaa-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'buscar_en_memoria', 'prohibida')$$, 'sí puede cambiar una herramienta editable');
reset role;

-- 3) Conexiones y tokens -----------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0c33590a-4c2a-4b32-a388-2008558688f7","role":"authenticated"}', true);
select throws_ok($$select token_ref from public.company_connections$$, '42501', null, 'token_ref no se puede leer desde el navegador');
select throws_ok($$select public.leer_token_conexion('a64499d1-7f43-4a43-abc8-41a313dc4018', 'cccccccc-0000-4000-8000-000000000001')$$, '42501', null, 'la función de leer tokens es solo del servidor');
reset role;
select public.guardar_token_conexion('a64499d1-7f43-4a43-abc8-41a313dc4018', 'cccccccc-0000-4000-8000-000000000001', 'token-en-claro');
select is(public.leer_token_conexion('a64499d1-7f43-4a43-abc8-41a313dc4018', 'cccccccc-0000-4000-8000-000000000001'), 'token-en-claro', 'el servidor recupera el token');
select is((select count(*) from vault.secrets where secret = 'token-en-claro'), 0::bigint, 'en vault.secrets el token no está en claro');

-- 4) agente_puede_trabajar -----------------------------------------------------------------------------------------------------
select is(public.agente_puede_trabajar('0e9902f1-d636-4806-a597-7d1d4bf9e7b4'), false, 'agente en pruebas: no puede trabajar');
insert into public.certification_requests (id, company_id, agent_id, agent_version, tipo, estado)
values ('dddddddd-0000-4000-8000-000000000001', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 1, 'nueva', 'aprobada');
insert into public.certifications (company_id, agent_id, agent_version, request_id, caduca_en)
values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 1, 'dddddddd-0000-4000-8000-000000000001', now() + interval '6 months');
update public.agents set estado = 'activo', version_certificada = 1, certificado_hasta = now() + interval '6 months' where id = '0e9902f1-d636-4806-a597-7d1d4bf9e7b4';
select is(public.agente_puede_trabajar('0e9902f1-d636-4806-a597-7d1d4bf9e7b4'), true, 'activo + certificación vigente + fecha futura: puede');
update public.agents set certificado_hasta = now() - interval '1 day' where id = '0e9902f1-d636-4806-a597-7d1d4bf9e7b4';
select is(public.agente_puede_trabajar('0e9902f1-d636-4806-a597-7d1d4bf9e7b4'), false, 'recertificación vencida: no puede');

select * from finish();
rollback;
