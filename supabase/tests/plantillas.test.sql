-- Tests de las plantillas: una versión sin certificar no sirve para crear agentes; una certificada sí; al subir la versión
-- vuelve a quedar pendiente. Ejecutar con: npm run test:db (todo se deshace al terminar).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.agent_templates (id, nombre_por_defecto, rol, departamento_tipo, descripcion_publica, instrucciones_base)
values ('plantilla-gate', 'Gate', 'Prueba', 'ventas', 'Pública', 'SECRETO');

select is(public.plantilla_certificada('plantilla-gate'), false, 'una plantilla nueva está pendiente de certificar');
select throws_ok(
  $$insert into public.agents (company_id, department_id, slug, name, role, creator_name, template_id)
    values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'gate-1', 'Gate', 'Prueba', 'IDESIE', 'plantilla-gate')$$,
  '42501', null, 'no se puede crear un agente desde una versión pendiente de certificar (ni siquiera con permisos de servidor)');

insert into public.template_certifications (template_id, template_version, caduca_en, es_dato_de_prueba)
values ('plantilla-gate', 1, now() + interval '6 months', true);
select is(public.plantilla_certificada('plantilla-gate'), true, 'con una certificación vigente de la versión actual queda certificada');
select lives_ok(
  $$insert into public.agents (id, company_id, department_id, slug, name, role, creator_name, template_id)
    values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'gate-2', 'Gate', 'Prueba', 'IDESIE', 'plantilla-gate')$$,
  'ya se puede crear un agente desde ella');

-- Una versión nueva (el script sube la versión al cambiar el contenido) vuelve a quedar pendiente.
update public.agent_templates set version = 2 where id = 'plantilla-gate';
select is(public.plantilla_certificada('plantilla-gate'), false, 'la versión 2 está pendiente de certificar aunque la 1 lo estuviera');
select is(public.plantilla_certificada('plantilla-gate', 1), true, 'la versión 1 sigue certificada');
select throws_ok(
  $$insert into public.agents (company_id, department_id, slug, name, role, creator_name, template_id)
    values ('a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'gate-3', 'Gate', 'Prueba', 'IDESIE', 'plantilla-gate')$$,
  '42501', null, 'con la versión 2 pendiente no se puede crear otro agente');

-- Una certificación caducada o retirada no vale.
insert into public.template_certifications (template_id, template_version, caduca_en, es_dato_de_prueba)
values ('plantilla-gate', 2, now() - interval '1 day', true);
select is(public.plantilla_certificada('plantilla-gate'), false, 'una certificación caducada no cuenta');

-- La empresa solo ve un sí/no en la vista pública, nunca la certificación ni las instrucciones.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0c33590a-4c2a-4b32-a388-2008558688f7","role":"authenticated"}', true);
select throws_ok($$select * from public.template_certifications$$, '42501', null, 'la empresa no lee las certificaciones de plantillas');

select * from finish();
rollback;
