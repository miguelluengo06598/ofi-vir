-- Reglas de agente · 1/2: estado «aplazada» (fuera de horario con «no responder»). En su propio archivo: un valor nuevo de un enum
-- no se puede usar en la misma transacción en la que se crea.
alter type public.task_status add value if not exists 'scheduled';
