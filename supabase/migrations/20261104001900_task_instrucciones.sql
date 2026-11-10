-- Cada tarea registra con qué instrucciones se ejecutó (hash SHA-256 de lo enviado en el mensaje de sistema) y qué partes
-- se recortaron por longitud. La versión del agente ya está en tasks.agent_version (migración del modelo de agentes).
alter table public.tasks
  add column instrucciones_hash text check (instrucciones_hash is null or instrucciones_hash ~ '^[0-9a-f]{64}$'),
  add column instrucciones_recortes jsonb not null default '[]'::jsonb check (jsonb_typeof(instrucciones_recortes) = 'array');
