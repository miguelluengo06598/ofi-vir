-- Tests del derecho de supresión (RGPD): erase_contact borra al contacto y lo que depende solo de él,
-- deja constancia sin datos personales y no toca otros contactos ni otras empresas. Se deshace al terminar.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Ids del seed (empresa A = Hogar Mediterráneo). Laura tiene hilo, correos, aprobaciones y nodos.
create temp table ids as select
  'a64499d1-7f43-4a43-abc8-41a313dc4018'::uuid as company_a,
  '3284e4bb-f1b6-4970-a406-41ca6176e2c5'::uuid as laura,
  '475a43fe-a454-4192-aa65-34dbdd28b35a'::uuid as marta,
  'b0000000-0000-4000-8000-000000000001'::uuid as company_b;

-- Empresa B mínima, solo para probar que no se cruzan datos.
insert into public.companies (id, name) values ((select company_b from ids), 'Taller Delta');

select ok((select count(*) from public.memory_nodes where contact_id = (select laura from ids)) > 0, 'antes: Laura tiene nodos');
select ok((select count(*) from public.email_threads where contact_id = (select laura from ids)) > 0, 'antes: Laura tiene hilos');
create temp table before_other as
  select (select count(*) from public.memory_nodes where contact_id = (select marta from ids)) as nodes,
         (select count(*) from public.email_threads where contact_id = (select marta from ids)) as threads;

-- Otra empresa no puede borrar un contacto ajeno.
select throws_ok(
  format('select public.erase_contact(%L, %L, %L)', (select company_b from ids), (select laura from ids), 'intruso'),
  'P0002', 'Contacto no encontrado', 'otra empresa no puede borrar el contacto');
select ok(exists (select 1 from public.contacts where id = (select laura from ids)), 'el intento ajeno no borró nada');

-- Un usuario autenticado (navegador) no puede ejecutarla: solo el servicio.
set local role authenticated;
select throws_ok(
  $q$select public.erase_contact('a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'navegador')$q$,
  '42501', null, 'authenticated no puede ejecutar erase_contact');
reset role;

create temp table result as
  select public.erase_contact((select company_a from ids), (select laura from ids), 'marcos@hogarmediterraneo.example') as r;

select is((select count(*)::int from public.contacts where id = (select laura from ids)), 0, 'el contacto ya no existe');
select is((select count(*)::int from public.memory_nodes where contact_id = (select laura from ids)), 0, 'sus nodos ya no existen');
select is((select count(*)::int from public.email_threads where contact_id = (select laura from ids)), 0, 'sus hilos ya no existen');
select is((select count(*)::int from public.emails where to_address = 'laura@clinicasol.example' or from_address = 'laura@clinicasol.example'), 0, 'sus correos ya no existen');
select is((select count(*)::int from public.approvals where lower(payload ->> 'to') = 'laura@clinicasol.example'), 0, 'sus aprobaciones de correo ya no existen');
select is(
  (select count(*)::int from public.memory_nodes where contact_id = (select marta from ids)),
  (select nodes::int from before_other), 'los nodos de otro contacto siguen');
select is(
  (select count(*)::int from public.email_threads where contact_id = (select marta from ids)),
  (select threads::int from before_other), 'los hilos de otro contacto siguen');

-- Constancia: existe, trae recuentos y no contiene datos personales.
select ok(
  (select (counts ->> 'nodos')::int > 0 and counts ->> 'contactos' = '1' from public.erasure_log where contact_id = (select laura from ids)),
  'queda constancia con recuentos');
select ok(
  (select row_to_json(l)::text !~* 'laura|clinicasol|gómez|gomez' from public.erasure_log l where contact_id = (select laura from ids)),
  'la constancia no guarda datos personales');

-- El servidor (service_role) puede leer y escribir; anon sigue sin acceso a nada.
select ok(has_table_privilege('service_role', 'public.memory_nodes', 'select, insert, update, delete'), 'service_role puede leer y escribir memoria');
select ok(has_table_privilege('service_role', 'public.contacts', 'select, insert, update, delete'), 'service_role puede leer y escribir contactos');
select ok(not has_table_privilege('anon', 'public.contacts', 'select'), 'anon sigue sin acceso');

select * from finish();
rollback;
