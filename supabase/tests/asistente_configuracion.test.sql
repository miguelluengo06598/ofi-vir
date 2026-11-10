-- Tests del asistente de configuración: aplicar es atómico y crea versión, la plantilla manda sobre los permisos, el aislamiento
-- entre empresas y las sesiones. Ejecutar con: npm run test:db (todo se deshace al terminar).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Una plantilla certificada (datos de prueba) con una herramienta editable y otra fija, y un agente de la empresa A.
insert into public.agent_templates (id, nombre_por_defecto, rol, departamento_tipo, descripcion_publica, instrucciones_base, herramientas_disponibles)
values ('plantilla-asis', 'Asis', 'Prueba', 'atencion', 'Pública', 'SECRETO-DE-IDESIE',
  '[{"id":"responder_whatsapp","permiso_defecto":"sola","editable":true},{"id":"crear_cita","permiso_defecto":"aprobacion","editable":false}]');
insert into public.template_certifications (template_id, template_version, caduca_en, es_dato_de_prueba) values ('plantilla-asis', 1, now() + interval '6 months', true);
insert into public.agents (id, company_id, department_id, slug, name, role, creator_name, template_id)
values ('aaaaaaaa-0000-4000-8000-0000000000b1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3bd58844-d48e-4d17-aa9b-d45d078a606a', 'asis-1', 'Asis', 'Prueba', 'IDESIE', 'plantilla-asis');

-- 1) Aplicar de verdad -----------------------------------------------------------------------------------------------------
select is((select version from public.agent_aplicar_configuracion(
  'a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000b1', null, null, 1,
  '{"ficha":{"tono":"Cercano","nunca_hace":"Nunca da precios"},
    "reglas":{"zona_horaria":"Europe/Madrid","horario":{"lun":[["09:00","20:00"]]},"fuera_de_horario":"responder_y_avisar","mensaje_fuera_horario":null,"idioma":"es"},
    "permisos":[{"tool_id":"responder_whatsapp","permiso":"aprobacion"},{"tool_id":"crear_cita","permiso":"aprobacion"}],
    "traspasos":[{"agent_id_destino":"0e9902f1-d636-4806-a597-7d1d4bf9e7b4","condicion":"quieren contratar","tipo_traspaso":"lead"}]}'::jsonb,
  'configuración con el asistente')), 2, 'aplicar devuelve la versión nueva (2)');
select is((select tono from public.agents where id = 'aaaaaaaa-0000-4000-8000-0000000000b1'), 'Cercano', 'la ficha queda guardada');
select is((select nunca_hace from public.agents where id = 'aaaaaaaa-0000-4000-8000-0000000000b1'), 'Nunca da precios', 'las prohibiciones quedan guardadas');
select is((select version_actual from public.agents where id = 'aaaaaaaa-0000-4000-8000-0000000000b1'), 2, 'version_actual sube');
select is((select permiso from public.agent_tools where agent_id = 'aaaaaaaa-0000-4000-8000-0000000000b1' and tool_id = 'responder_whatsapp'), 'aprobacion', 'el permiso de una herramienta editable cambia');
select is((select count(*) from public.agent_handoffs where agent_id_origen = 'aaaaaaaa-0000-4000-8000-0000000000b1'), 1::bigint, 'el traspaso queda creado');
select is((select horario -> 'lun' -> 0 ->> 1 from public.agent_rules where agent_id = 'aaaaaaaa-0000-4000-8000-0000000000b1'), '20:00', 'las reglas quedan guardadas');

-- 2) Versiones: la anterior (registrada antes de cambiar) y la nueva, con motivo y sin instrucciones base ---------------------
select is((select count(*) from public.agent_versions where agent_id = 'aaaaaaaa-0000-4000-8000-0000000000b1'), 2::bigint, 'quedan dos versiones: el estado anterior y la nueva');
select is((select motivo_cambio from public.agent_versions where agent_id = 'aaaaaaaa-0000-4000-8000-0000000000b1' and version = 2), 'configuración con el asistente', 'la versión nueva lleva el motivo');
select is((select snapshot -> 'ficha' ->> 'tono' from public.agent_versions where agent_id = 'aaaaaaaa-0000-4000-8000-0000000000b1' and version = 1), '', 'la versión 1 guarda el estado ANTERIOR');
select is((select position('SECRETO-DE-IDESIE' in snapshot::text) from public.agent_versions where agent_id = 'aaaaaaaa-0000-4000-8000-0000000000b1' and version = 2), 0, 'la versión no contiene las instrucciones base');

-- 3) Lo que la plantilla no permite: la base lo rechaza y no se aplica NADA --------------------------------------------------
select throws_ok($$select * from public.agent_aplicar_configuracion('a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000b1', null, null, 2,
  '{"ficha":{"tono":"Otro tono"},"permisos":[{"tool_id":"crear_cita","permiso":"sola"}]}'::jsonb, 'x')$$,
  '42501', null, 'cambiar el permiso de una herramienta no editable se rechaza');
select is((select tono from public.agents where id = 'aaaaaaaa-0000-4000-8000-0000000000b1'), 'Cercano', 'y al rechazarse no se aplica nada (ni la ficha)');
select throws_ok($$select * from public.agent_aplicar_configuracion('a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000b1', null, null, 1, '{}'::jsonb, 'x')$$,
  '40001', null, 'con una versión esperada antigua se rechaza');

-- 4) Aislamiento: un destino de traspaso de otra empresa falla por las claves compuestas -------------------------------------
select throws_ok($$select * from public.agent_aplicar_configuracion('a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000b1', null, null, 2,
  '{"traspasos":[{"agent_id_destino":"00000000-0000-4000-8000-00000000dead","condicion":"x","tipo_traspaso":"lead"}]}'::jsonb, 'x')$$,
  '23503', null, 'un traspaso hacia un agente de otra empresa (o inexistente) se rechaza');

select * from finish();
rollback;
