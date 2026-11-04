-- Tareas sospechosas: el contenido externo que leyó el agente intentaba darle órdenes (o el modelo intentó salirse de sus permisos).
alter table public.tasks add column suspicious boolean not null default false;
create index tasks_suspicious_idx on public.tasks (company_id) where suspicious;
