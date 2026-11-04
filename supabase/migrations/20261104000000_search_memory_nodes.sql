-- Fase 2 · Búsqueda semántica con la clave de servicio.
-- `match_memory_nodes` depende de la RLS para limitar por empresa, pero `service_role` se la salta:
-- esta versión recibe la empresa y filtra por ella. Solo la puede ejecutar el servicio.

create function public.search_memory_nodes(p_company_id uuid, query_embedding extensions.vector(1024), match_count integer default 10)
returns table (id uuid, title text, node_type public.memory_node_type, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select n.id, n.title, n.node_type, 1 - (n.embedding operator(extensions.<=>) query_embedding) as similarity
    from public.memory_nodes n
   where n.company_id = p_company_id
     and n.embedding is not null
   order by n.embedding operator(extensions.<=>) query_embedding
   limit least(match_count, 50)
$$;

revoke all on function public.search_memory_nodes(uuid, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.search_memory_nodes(uuid, extensions.vector, integer) to service_role;
