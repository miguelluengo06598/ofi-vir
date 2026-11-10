-- RLS en todas las tablas (regla del proyecto). quality_control_settings ya no tenía permisos para anon ni authenticated
-- (solo service_role, que se salta RLS): esto es defensa en profundidad y no cambia el comportamiento.
alter table public.quality_control_settings enable row level security;
