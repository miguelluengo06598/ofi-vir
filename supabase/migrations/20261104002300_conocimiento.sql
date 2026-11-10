-- Fase 2 · Conocimiento de los agentes (2/2). Reutiliza la memoria de la oficina: cada fragmento es un nodo
-- `conocimiento` de `memory_nodes` (con su vector), enlazado con su fuente en `agent_knowledge`. No hay un segundo buscador.

-- 1) La fuente: qué se procesa, de dónde viene y cómo va ----------------------------------------------------------------------
alter table public.agent_knowledge
  add column contenido text,                    -- texto libre y FAQ (lo escribe la empresa); web y documento no lo guardan aquí
  add column storage_path text,                 -- documento subido: <company_id>/<id>/<archivo> dentro del bucket «conocimiento»
  add column bytes bigint check (bytes is null or bytes >= 0),
  add column fragmentos integer not null default 0 check (fragmentos >= 0),
  add column paginas integer not null default 0 check (paginas >= 0),   -- páginas web leídas
  add column avisos text[] not null default '{}',                       -- p. ej. «contiene órdenes ocultas»: lo ve la empresa
  add column created_by uuid,
  add column iniciado_en timestamptz not null default now(),     -- cada (re)intento de procesado; una fuente «procesando» muy antigua se puede reintentar
  add column procesado_en timestamptz,
  add constraint agent_knowledge_error_coherente check ((estado = 'error') = (error is not null)),
  add constraint agent_knowledge_titulo_largo check (char_length(titulo) between 1 and 200),
  add constraint agent_knowledge_contenido_largo check (contenido is null or char_length(contenido) <= 500000),
  add foreign key (company_id, created_by) references public.users (company_id, id);

-- Un documento solo vive en la carpeta de su empresa y de su fuente.
alter table public.agent_knowledge
  add constraint agent_knowledge_ruta_propia check (
    storage_path is null or storage_path like company_id::text || '/' || id::text || '/%'
  );

-- 2) El fragmento: nodo de memoria ligado a su fuente y a su ámbito -------------------------------------------------------------
alter table public.memory_nodes
  add column ambito_agent_id uuid,              -- null = toda la oficina; si no, solo ese agente
  add column fragmento_n integer check (fragmento_n is null or fragmento_n >= 0),
  add foreign key (company_id, ambito_agent_id) references public.agents (company_id, id) on delete cascade;
-- Un nodo de conocimiento siempre cuelga de una fuente, siempre viene de fuera (dato no fiable) y no es de un contacto.
alter table public.memory_nodes
  add constraint memory_nodes_conocimiento_coherente check (
    (node_type = 'conocimiento') = (knowledge_id is not null)
    and (node_type <> 'conocimiento' or (external and contact_id is null))
    and (node_type = 'conocimiento' or (ambito_agent_id is null and fragmento_n is null))
  );
create index memory_nodes_ambito_idx on public.memory_nodes (company_id, ambito_agent_id) where node_type = 'conocimiento';

-- 3) La empresa solo LEE sus fuentes y fragmentos: crear, procesar y borrar lo hace el servidor (así se limpia también el archivo) -
drop policy agent_knowledge_write on public.agent_knowledge;
revoke insert, update, delete on public.agent_knowledge from authenticated;
-- Y no puede fabricar ni cambiar fragmentos a mano: «conocimiento» solo lo escribe el servidor tras procesar una fuente.
create policy memory_nodes_sin_conocimiento_ins on public.memory_nodes as restrictive for insert to authenticated
  with check (node_type <> 'conocimiento');
create policy memory_nodes_sin_conocimiento_upd on public.memory_nodes as restrictive for update to authenticated
  using (node_type <> 'conocimiento') with check (node_type <> 'conocimiento');
create policy memory_nodes_sin_conocimiento_del on public.memory_nodes as restrictive for delete to authenticated
  using (node_type <> 'conocimiento');

-- 4) Búsquedas ----------------------------------------------------------------------------------------------------------------
-- La búsqueda general de la memoria NO devuelve conocimiento (el de un agente concreto no debe verlo otro): para eso está la de abajo.
create or replace function public.search_memory_nodes(p_company_id uuid, query_embedding extensions.vector(1024), match_count integer default 10)
returns table (id uuid, title text, node_type public.memory_node_type, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select n.id, n.title, n.node_type, 1 - (n.embedding operator(extensions.<=>) query_embedding) as similarity
    from public.memory_nodes n
   where n.company_id = p_company_id
     and n.node_type <> 'conocimiento'
     and n.embedding is not null
   order by n.embedding operator(extensions.<=>) query_embedding
   limit least(match_count, 50)
$$;

-- Conocimiento de ese agente y de toda la oficina, nada más (de ninguna fuente que no esté «lista»).
create function public.search_knowledge_nodes(p_company_id uuid, p_agent_id uuid, query_embedding extensions.vector(1024), match_count integer default 10)
returns table (id uuid, title text, node_type public.memory_node_type, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select n.id, n.title, n.node_type, 1 - (n.embedding operator(extensions.<=>) query_embedding) as similarity
    from public.memory_nodes n
    join public.agent_knowledge k on k.company_id = n.company_id and k.id = n.knowledge_id
   where n.company_id = p_company_id
     and n.node_type = 'conocimiento'
     and k.estado = 'listo'
     and (n.ambito_agent_id is null or n.ambito_agent_id = p_agent_id)
     and n.embedding is not null
   order by n.embedding operator(extensions.<=>) query_embedding
   limit least(match_count, 50)
$$;
revoke all on function public.search_knowledge_nodes(uuid, uuid, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.search_knowledge_nodes(uuid, uuid, extensions.vector, integer) to service_role;

-- 5) Archivos subidos: bucket privado (sin políticas: solo el servidor lo toca), 20 MB y solo PDF, DOCX y TXT ----------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conocimiento', 'conocimiento', false, 20971520,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
