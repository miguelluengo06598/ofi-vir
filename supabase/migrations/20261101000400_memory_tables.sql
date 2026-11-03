-- Fase 2 · Modelo de datos (5/6): memoria (red de conocimiento de la oficina).

create table public.memory_nodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Cliente al que pertenece el nodo (el «racimo»). Borrar el contacto borra todo lo suyo.
  contact_id uuid,
  node_type public.memory_node_type not null,
  title text not null,
  content text not null default '',
  -- Vector semántico (1024 dimensiones; ajustar al modelo de embeddings que se elija).
  embedding extensions.vector(1024),
  created_by_agent_id uuid,
  created_by_user_id uuid,
  -- Confianza del dato, de 0 a 1.
  confidence numeric(3, 2) not null default 1.00 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, contact_id) references public.contacts (company_id, id) on delete cascade,
  foreign key (company_id, created_by_agent_id) references public.agents (company_id, id),
  foreign key (company_id, created_by_user_id) references public.users (company_id, id),
  -- «Quién lo creó»: un agente o una persona, nunca ambos ni ninguno.
  check (num_nonnulls(created_by_agent_id, created_by_user_id) = 1)
);
create index memory_nodes_contact_idx on public.memory_nodes (company_id, contact_id);
create index memory_nodes_type_idx on public.memory_nodes (company_id, node_type);
create index memory_nodes_embedding_idx on public.memory_nodes using hnsw (embedding extensions.vector_cosine_ops);

create table public.memory_edges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  from_node_id uuid not null,
  to_node_id uuid not null,
  kind public.memory_edge_kind not null,
  created_by_agent_id uuid,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, from_node_id, to_node_id, kind),
  foreign key (company_id, from_node_id) references public.memory_nodes (company_id, id) on delete cascade,
  foreign key (company_id, to_node_id) references public.memory_nodes (company_id, id) on delete cascade,
  foreign key (company_id, created_by_agent_id) references public.agents (company_id, id),
  foreign key (company_id, created_by_user_id) references public.users (company_id, id),
  check (from_node_id <> to_node_id),
  check (num_nonnulls(created_by_agent_id, created_by_user_id) = 1)
);
create index memory_edges_from_idx on public.memory_edges (company_id, from_node_id);
create index memory_edges_to_idx on public.memory_edges (company_id, to_node_id);

-- Búsqueda semántica: SECURITY INVOKER, así la RLS limita el resultado a la empresa de quien llama.
create function public.match_memory_nodes(query_embedding extensions.vector(1024), match_count integer default 10)
returns table (id uuid, title text, node_type public.memory_node_type, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select n.id, n.title, n.node_type, 1 - (n.embedding operator(extensions.<=>) query_embedding) as similarity
    from public.memory_nodes n
   where n.embedding is not null
   order by n.embedding operator(extensions.<=>) query_embedding
   limit least(match_count, 50)
$$;

revoke all on function public.match_memory_nodes(extensions.vector, integer) from public;
grant execute on function public.match_memory_nodes(extensions.vector, integer) to authenticated, service_role;
