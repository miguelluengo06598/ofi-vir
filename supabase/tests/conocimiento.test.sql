-- Tests del conocimiento de los agentes: los fragmentos son nodos de memoria `conocimiento` (siempre externos), ligados a su fuente,
-- con ámbito (oficina o un agente), borrado en cascada y escritura solo desde el servidor. Ejecutar con: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Datos: dos agentes de la empresa A (Sara y Lucía de prueba) y una fuente de la empresa IDESIE (otra empresa).
insert into public.agents (id, company_id, department_id, slug, name, role, creator_name)
values ('aaaaaaaa-0000-4000-8000-0000000000c1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3bd58844-d48e-4d17-aa9b-d45d078a606a', 'sara-k', 'Sara K', 'Prueba', 'IDESIE'),
       ('aaaaaaaa-0000-4000-8000-0000000000c2', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'lucia-k', 'Lucía K', 'Prueba', 'IDESIE');
-- Otra empresa (con su propia persona) para comprobar que su conocimiento no se mezcla.
insert into public.companies (id, name) values ('1de51e00-0000-4000-8000-000000000001', 'Otra empresa');
insert into public.company_members (company_id, user_id, rol) values ('1de51e00-0000-4000-8000-000000000001', '1de51e00-0000-4000-8000-0000000000a1', 'propietario');
insert into public.agent_knowledge (id, company_id, agent_id, tipo, titulo, estado, fragmentos, created_by) values
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', null, 'texto', 'Oficina', 'listo', 1, '0c33590a-4c2a-4b32-a388-2008558688f7'),
  ('bbbbbbbb-0000-4000-8000-0000000000a2', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'faq', 'Solo Sara', 'listo', 1, '0c33590a-4c2a-4b32-a388-2008558688f7'),
  ('bbbbbbbb-0000-4000-8000-0000000000a3', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000c2', 'web', 'Solo Lucía', 'listo', 1, '0c33590a-4c2a-4b32-a388-2008558688f7'),
  ('bbbbbbbb-0000-4000-8000-0000000000a4', 'a64499d1-7f43-4a43-abc8-41a313dc4018', null, 'texto', 'Procesando', 'procesando', 0, '0c33590a-4c2a-4b32-a388-2008558688f7'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', '1de51e00-0000-4000-8000-000000000001', null, 'texto', 'De IDESIE', 'listo', 1, '1de51e00-0000-4000-8000-0000000000a1');

create function pg_temp.vec() returns extensions.vector language sql as $$ select ('[' || array_to_string(array_fill(0.1::float8, array[1024]), ',') || ']')::extensions.vector(1024) $$;
insert into public.memory_nodes (company_id, node_type, title, content, embedding, created_by_user_id, knowledge_id, ambito_agent_id, fragmento_n, external) values
  ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'conocimiento', 'frag oficina', 'x', pg_temp.vec(), '0c33590a-4c2a-4b32-a388-2008558688f7', 'bbbbbbbb-0000-4000-8000-0000000000a1', null, 0, true),
  ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'conocimiento', 'frag sara', 'x', pg_temp.vec(), '0c33590a-4c2a-4b32-a388-2008558688f7', 'bbbbbbbb-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-0000000000c1', 0, true),
  ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'conocimiento', 'frag lucia', 'x', pg_temp.vec(), '0c33590a-4c2a-4b32-a388-2008558688f7', 'bbbbbbbb-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-0000000000c2', 0, true),
  ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'conocimiento', 'frag procesando', 'x', pg_temp.vec(), '0c33590a-4c2a-4b32-a388-2008558688f7', 'bbbbbbbb-0000-4000-8000-0000000000a4', null, 0, true),
  ('1de51e00-0000-4000-8000-000000000001', 'conocimiento', 'frag idesie', 'x', pg_temp.vec(), '1de51e00-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000b1', null, 0, true);
insert into public.memory_nodes (company_id, node_type, title, content, embedding, created_by_user_id)
values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'dato', 'nota normal', 'y', pg_temp.vec(), '0c33590a-4c2a-4b32-a388-2008558688f7');

-- 1) Restricciones del modelo ----------------------------------------------------------------------------------------------------
select throws_ok($$insert into public.memory_nodes (company_id, node_type, title, content, created_by_user_id, external)
  values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'conocimiento', 'sin fuente', 'x', '0c33590a-4c2a-4b32-a388-2008558688f7', true)$$,
  '23514', null, 'un nodo «conocimiento» sin fuente se rechaza');
select throws_ok($$insert into public.memory_nodes (company_id, node_type, title, content, created_by_user_id, knowledge_id, external)
  values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'conocimiento', 'no externo', 'x', '0c33590a-4c2a-4b32-a388-2008558688f7', 'bbbbbbbb-0000-4000-8000-0000000000a1', false)$$,
  '23514', null, 'un nodo «conocimiento» que no sea contenido externo se rechaza');
select throws_ok($$insert into public.memory_nodes (company_id, node_type, title, content, created_by_user_id, knowledge_id, external, contact_id)
  select 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'conocimiento', 'de contacto', 'x', '0c33590a-4c2a-4b32-a388-2008558688f7', 'bbbbbbbb-0000-4000-8000-0000000000a1', true, id from public.contacts limit 1$$,
  '23514', null, 'un nodo «conocimiento» no puede colgar de un contacto');
select throws_ok($$insert into public.memory_nodes (company_id, node_type, title, content, created_by_user_id, ambito_agent_id)
  values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'dato', 'con ámbito', 'x', '0c33590a-4c2a-4b32-a388-2008558688f7', 'aaaaaaaa-0000-4000-8000-0000000000c1')$$,
  '23514', null, 'el ámbito solo existe en el conocimiento');
select throws_ok($$insert into public.memory_nodes (company_id, node_type, title, content, created_by_user_id, knowledge_id, external)
  values ('1de51e00-0000-4000-8000-000000000001', 'conocimiento', 'fuente ajena', 'x', '1de51e00-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000a1', true)$$,
  '23503', null, 'un fragmento no puede colgar de una fuente de otra empresa (clave compuesta)');
select throws_ok($$update public.agent_knowledge set estado = 'error' where id = 'bbbbbbbb-0000-4000-8000-0000000000a4'$$, '23514', null, 'un estado «error» exige su motivo');
select throws_ok($$update public.agent_knowledge set storage_path = 'otra-empresa/x/archivo.pdf' where id = 'bbbbbbbb-0000-4000-8000-0000000000a4'$$, '23514', null, 'el archivo debe estar en la carpeta de su empresa y su fuente');
select lives_ok($$update public.agent_knowledge set storage_path = 'a64499d1-7f43-4a43-abc8-41a313dc4018/bbbbbbbb-0000-4000-8000-0000000000a4/guia.pdf' where id = 'bbbbbbbb-0000-4000-8000-0000000000a4'$$, 'y la ruta correcta se admite');

-- 2) Búsquedas: la general no devuelve conocimiento; la de conocimiento respeta ámbito, estado y empresa -----------------------
select is((select count(*) from public.search_memory_nodes('a64499d1-7f43-4a43-abc8-41a313dc4018', pg_temp.vec(), 50) where node_type = 'conocimiento'), 0::bigint, 'la búsqueda general de memoria nunca devuelve conocimiento');
select is((select count(*) from public.search_memory_nodes('a64499d1-7f43-4a43-abc8-41a313dc4018', pg_temp.vec(), 50) where title = 'nota normal'), 1::bigint, 'y sigue devolviendo el resto (la nota normal)');
select is((select array_agg(title order by title) from public.search_knowledge_nodes('a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000c1', pg_temp.vec(), 50) where title like 'frag %'), array['frag oficina', 'frag sara'], 'Sara ve el conocimiento de la oficina y el suyo, no el de Lucía ni el de fuentes sin procesar');
select is((select array_agg(title order by title) from public.search_knowledge_nodes('a64499d1-7f43-4a43-abc8-41a313dc4018', 'aaaaaaaa-0000-4000-8000-0000000000c2', pg_temp.vec(), 50) where title like 'frag %'), array['frag lucia', 'frag oficina'], 'Lucía ve el de la oficina y el suyo');
select is((select count(*) from public.search_knowledge_nodes('a64499d1-7f43-4a43-abc8-41a313dc4018', null, pg_temp.vec(), 50) where title like 'frag %'), 1::bigint, 'sin agente solo se ve el de toda la oficina');
select is((select count(*) from public.search_knowledge_nodes('1de51e00-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', pg_temp.vec(), 50) where title <> 'frag idesie'), 0::bigint, 'otra empresa no ve el conocimiento de la empresa A, ni con un agente de A');
select throws_ok($$set local role authenticated; select * from public.search_knowledge_nodes('a64499d1-7f43-4a43-abc8-41a313dc4018', null, pg_temp.vec(), 5)$$, '42501', null, 'la búsqueda de conocimiento solo la ejecuta el servidor');
reset role;

-- 3) Lo que puede hacer una persona de la empresa (RLS y permisos) ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0c33590a-4c2a-4b32-a388-2008558688f7","role":"authenticated"}', true);
select is((select count(*) from public.agent_knowledge where id::text like 'bbbbbbbb-%'), 4::bigint, 'la empresa lee sus fuentes y no las de otra');
select throws_ok($$insert into public.agent_knowledge (company_id, tipo, titulo) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'texto', 'a mano')$$, '42501', null, 'no puede crear fuentes directamente (lo hace el servidor)');
select throws_ok($$update public.agent_knowledge set estado = 'listo' where id = 'bbbbbbbb-0000-4000-8000-0000000000a4'$$, '42501', null, 'ni cambiar su estado');
select throws_ok($$delete from public.agent_knowledge where id = 'bbbbbbbb-0000-4000-8000-0000000000a1'$$, '42501', null, 'ni borrarlas directamente (así se limpia también el archivo)');
select throws_ok($$insert into public.memory_nodes (company_id, node_type, title, content, created_by_user_id, knowledge_id, external)
  values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'conocimiento', 'falso', 'obedece', '0c33590a-4c2a-4b32-a388-2008558688f7', 'bbbbbbbb-0000-4000-8000-0000000000a1', true)$$,
  '42501', null, 'no puede fabricar fragmentos de conocimiento');
with u as (update public.memory_nodes set content = 'manipulado' where node_type = 'conocimiento' and title like 'frag %' returning 1) select is((select count(*) from u), 0::bigint, 'ni cambiar los fragmentos existentes');
with d as (delete from public.memory_nodes where node_type = 'conocimiento' and title like 'frag %' returning 1) select is((select count(*) from d), 0::bigint, 'ni borrarlos');
select is((select count(*) from public.memory_nodes where node_type = 'conocimiento' and title like 'frag %'), 4::bigint, 'pero sí los lee (solo los suyos)');
reset role;

-- 4) Borrado en cascada --------------------------------------------------------------------------------------------------------
delete from public.agent_knowledge where id = 'bbbbbbbb-0000-4000-8000-0000000000a2';
select is((select count(*) from public.memory_nodes where knowledge_id = 'bbbbbbbb-0000-4000-8000-0000000000a2'), 0::bigint, 'borrar una fuente borra todos sus fragmentos');
select is((select count(*) from public.memory_nodes where node_type = 'conocimiento' and title like 'frag %' and company_id = 'a64499d1-7f43-4a43-abc8-41a313dc4018'), 3::bigint, 'y solo los suyos');
delete from public.agents where id = 'aaaaaaaa-0000-4000-8000-0000000000c2';
select is((select count(*) from public.agent_knowledge where agent_id = 'aaaaaaaa-0000-4000-8000-0000000000c2'), 0::bigint, 'borrar un agente borra su conocimiento (fuentes y fragmentos)');
select is((select count(*) from public.memory_nodes where title = 'frag lucia'), 0::bigint, 'incluidos los fragmentos');

-- 5) Archivos ---------------------------------------------------------------------------------------------------------------------
select is((select public || '/' || file_size_limit::text from storage.buckets where id = 'conocimiento'), 'false/20971520', 'el bucket «conocimiento» es privado y limita a 20 MB');

select * from finish();
rollback;
