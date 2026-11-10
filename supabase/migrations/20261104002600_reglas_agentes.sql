-- Reglas de agente · 2/2: tarea aplazada, idioma «auto», avisos a la empresa y consumo de créditos por agente.

-- 1) Tareas aplazadas: se guarda el mensaje (la instrucción) y se procesa al abrir el horario ------------------------------------
alter table public.tasks add column aplazada_hasta timestamptz, add column instruccion_aplazada text;
create index tasks_aplazadas_idx on public.tasks (aplazada_hasta) where status = 'scheduled';
alter table public.tasks add constraint tasks_aplazada_coherente check (status <> 'scheduled' or aplazada_hasta is not null);

-- Reanuda UNA tarea aplazada si ya toca (atómico: solo un proceso la consigue). Devuelve la instrucción guardada.
create function public.tarea_reanudar_aplazada(p_company_id uuid, p_task_id uuid, p_ahora timestamptz)
returns table (instruccion text)
language sql
security definer
set search_path = ''
as $$
  update public.tasks t set status = 'running', aplazada_hasta = null
   where t.id = p_task_id and t.company_id = p_company_id and t.status = 'scheduled' and t.aplazada_hasta <= p_ahora
  returning t.instruccion_aplazada
$$;

-- 2) Idioma: «auto» = el del mensaje recibido (por defecto); cualquier otro valor lo fija la empresa ------------------------------
alter table public.agent_rules alter column idioma set default 'auto';

-- 3) Avisos a la empresa por reglas (límite de mensajes, tope de créditos). Se conservan TODOS los tipos anteriores. -------------
alter table public.notifications drop constraint notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check check (tipo in (
  'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica',
  'lote_por_caducar', 'oficina_pausada', 'borrado_programado', 'bono_renovado',
  'conexion_caducada',
  'limite_mensajes_agente', 'tope_creditos_agente'
));

-- Un aviso por agente y tipo desde `p_desde` (día o mes): atómico, sin duplicados aunque dos procesos coincidan.
create function public.aviso_regla_agente(p_company_id uuid, p_agent_id uuid, p_tipo text, p_titulo text, p_cuerpo text, p_desde timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || p_agent_id::text || p_tipo, 0));
  if exists (select 1 from public.notifications n
              where n.company_id = p_company_id and n.tipo = p_tipo and n.metadatos ->> 'agent_id' = p_agent_id::text and n.creado_en >= p_desde) then
    return false;
  end if;
  insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
  values (p_company_id, p_tipo, p_titulo, p_cuerpo, jsonb_build_object('agent_id', p_agent_id));
  return true;
end;
$$;

-- 4) Créditos que ha consumido un agente desde una fecha (tope mensual por agente) -------------------------------------------------
create function public.agent_creditos_consumidos(p_company_id uuid, p_agent_id uuid, p_desde timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(-sum(creditos), 0)::integer from public.credit_ledger
   where company_id = p_company_id and agent_id = p_agent_id and tipo = 'consumo' and creado_en >= p_desde
$$;

revoke all on function public.tarea_reanudar_aplazada(uuid, uuid, timestamptz), public.aviso_regla_agente(uuid, uuid, text, text, text, timestamptz),
  public.agent_creditos_consumidos(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.tarea_reanudar_aplazada(uuid, uuid, timestamptz), public.aviso_regla_agente(uuid, uuid, text, text, text, timestamptz),
  public.agent_creditos_consumidos(uuid, uuid, timestamptz) to service_role;
