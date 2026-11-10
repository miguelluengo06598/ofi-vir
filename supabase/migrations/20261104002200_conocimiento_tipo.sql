-- Fase 2 · Conocimiento de los agentes (1/2): nuevo tipo de nodo de memoria.
-- Va en su propia migración: un valor nuevo de un enum no se puede usar en la transacción que lo crea.
alter type public.memory_node_type add value if not exists 'conocimiento';
