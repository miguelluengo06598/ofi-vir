-- Traspasos reales entre agentes: ficha estructurada por tipo, tarea para el agente destino, cadena con límite y detección de bucles,
-- y cobro de 1 crédito por traspaso. Todo en UNA transacción (si no hay saldo, no se crea nada).

-- 1) Columnas ---------------------------------------------------------------------------------------------------------------------
alter table public.handoff_chains add column estado text not null default 'activa' check (estado in ('activa', 'cortada')), add column motivo_corte text;

alter table public.handoffs
  add column tipo_traspaso text check (tipo_traspaso in ('lead', 'cita', 'incidencia', 'datos', 'otro')),
  add column ficha jsonb,                 -- la ficha validada por tipo (la `card` es su versión para mostrar)
  add column ficha_hash text,             -- huella de la ficha: detecta bucles
  add column origin_task_id uuid,
  add column dest_task_id uuid;
create index handoffs_ficha_idx on public.handoffs (company_id, chain_id, ficha_hash) where ficha_hash is not null;

alter table public.tasks
  add column chain_id uuid,
  add column handoff_id uuid,
  add column instruccion_entrada text;    -- lo que recibe el agente destino (la ficha, ya delimitada si venía de contenido externo)
alter table public.tasks add foreign key (company_id, chain_id) references public.handoff_chains (company_id, id) on delete set null (chain_id);
create index tasks_traspaso_idx on public.tasks (handoff_id) where handoff_id is not null;

-- 2) Avisos: se conservan TODOS los tipos anteriores ---------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check check (tipo in (
  'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica',
  'lote_por_caducar', 'oficina_pausada', 'borrado_programado', 'bono_renovado',
  'conexion_caducada', 'limite_mensajes_agente', 'tope_creditos_agente',
  'traspaso_cortado'
));

-- 3) Crear un traspaso (solo servidor) ---------------------------------------------------------------------------------------------------
-- Devuelve un jsonb: {resultado: 'creado' | 'limite' | 'bucle', ...}. Con 'limite' o 'bucle' NO se crea nada: se corta la cadena y se avisa a la empresa.
-- Sin saldo: SQLSTATE CR001 (lo lanza consumir_creditos) y se deshace todo. Sin traspaso configurado y activo: 42501.
create function public.agent_traspaso_crear(
  p_company_id uuid, p_from_agent uuid, p_to_agent uuid, p_tipo text, p_kind public.handoff_kind,
  p_summary text, p_card jsonb, p_ficha jsonb, p_ficha_hash text, p_contact_id uuid, p_origin_task_id uuid,
  p_instruccion text, p_max_cadena integer, p_creditos integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.agents;
  v_to public.agents;
  v_cfg public.agent_handoffs;
  v_chain uuid;
  v_pos integer;
  v_handoff uuid := gen_random_uuid();
  v_task uuid;
  v_motivo text;
begin
  select * into v_from from public.agents where company_id = p_company_id and id = p_from_agent;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  select * into v_to from public.agents where company_id = p_company_id and id = p_to_agent;
  if not found then raise exception 'Agente de destino no encontrado' using errcode = 'P0002'; end if;
  -- Solo destinos CONFIGURADOS para este agente, ACTIVOS y de la misma empresa (las claves compuestas ya impiden otra empresa).
  select * into v_cfg from public.agent_handoffs h
   where h.company_id = p_company_id and h.agent_id_origen = p_from_agent and h.agent_id_destino = p_to_agent and h.activo;
  if not found then raise exception 'TRASPASO_NO_CONFIGURADO: la empresa no ha configurado este traspaso' using errcode = '42501'; end if;
  if v_cfg.tipo_traspaso <> p_tipo then raise exception 'TIPO_NO_CONFIGURADO: el traspaso configurado es de tipo %', v_cfg.tipo_traspaso using errcode = '42501'; end if;

  -- Cadena: la de la tarea de origen, o una nueva. Se serializa por cadena para contar bien posiciones y bucles.
  if p_origin_task_id is not null then
    select t.chain_id into v_chain from public.tasks t where t.company_id = p_company_id and t.id = p_origin_task_id;
  end if;
  if v_chain is null then
    insert into public.handoff_chains (company_id, title, goal)
    values (p_company_id, left(v_from.name || ' → ' || v_to.name || ': ' || p_summary, 200), left(p_summary, 500)) returning id into v_chain;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_chain::text, 0));
  select count(*) + 1 into v_pos from public.handoffs where company_id = p_company_id and chain_id = v_chain;

  -- Bucle: la misma ficha ya viajó entre estos dos agentes (en cualquier sentido: A → B → A).
  if exists (select 1 from public.handoffs h where h.company_id = p_company_id and h.chain_id = v_chain and h.ficha_hash = p_ficha_hash
              and ((h.from_agent_id = p_from_agent and h.to_agent_id = p_to_agent) or (h.from_agent_id = p_to_agent and h.to_agent_id = p_from_agent))) then
    v_motivo := 'bucle';
  elsif v_pos > p_max_cadena then
    v_motivo := 'limite';
  end if;
  if v_motivo is not null then
    update public.handoff_chains set estado = 'cortada', motivo_corte = v_motivo where company_id = p_company_id and id = v_chain;
    if not exists (select 1 from public.notifications n where n.company_id = p_company_id and n.tipo = 'traspaso_cortado' and n.metadatos ->> 'chain_id' = v_chain::text) then
      insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
      values (p_company_id, 'traspaso_cortado',
              case v_motivo when 'bucle' then 'Se ha cortado un bucle entre agentes' else 'Se ha cortado una cadena de traspasos demasiado larga' end,
              format('%s intentó pasar trabajo a %s y se ha cortado: %s. Revisa la cadena y los traspasos configurados.', v_from.name, v_to.name,
                     case v_motivo when 'bucle' then 'la misma ficha ya había viajado entre esos dos agentes' else format('la cadena ya tiene %s traspasos (el máximo)', p_max_cadena) end),
              jsonb_build_object('chain_id', v_chain, 'motivo', v_motivo));
    end if;
    return jsonb_build_object('resultado', v_motivo, 'chain_id', v_chain, 'posicion', v_pos);
  end if;

  -- La tarea del agente destino, con la ficha como entrada.
  insert into public.tasks (company_id, agent_id, title, model, status, contact_id, chain_id, handoff_id, instruccion_entrada)
  values (p_company_id, p_to_agent, left('Traspaso de ' || v_from.name || ': ' || p_summary, 200), v_to.model, 'running', p_contact_id, v_chain, v_handoff, p_instruccion)
  returning id into v_task;

  insert into public.handoffs (id, company_id, chain_id, position, from_agent_id, to_agent_id, from_department_id, to_department_id, kind, summary, bubble, card,
                               status, credits, contact_id, tipo_traspaso, ficha, ficha_hash, origin_task_id, dest_task_id)
  values (v_handoff, p_company_id, v_chain, v_pos, v_from.id, v_to.id, v_from.department_id, v_to.department_id, p_kind, p_summary,
          v_to.name || ' recibió un traspaso de ' || v_from.name, coalesce(p_card, '[]'::jsonb), 'sent', p_creditos, p_contact_id, p_tipo, p_ficha, p_ficha_hash,
          p_origin_task_id, v_task);

  -- 1 crédito por traspaso, en la misma transacción: si no hay saldo, CR001 y no queda nada creado.
  perform public.consumir_creditos(p_company_id, p_creditos, 'traspaso', p_origin_task_id, v_from.id, v_from.department_id, 'traspaso:' || v_handoff,
                                   jsonb_build_object('handoff_id', v_handoff, 'chain_id', v_chain, 'destino', v_to.id));
  return jsonb_build_object('resultado', 'creado', 'handoff_id', v_handoff, 'chain_id', v_chain, 'posicion', v_pos, 'task_id', v_task,
                            'to_agent_id', v_to.id, 'to_agent_name', v_to.name);
end;
$$;

-- Tareas de traspaso todavía sin ejecutar (en marcha y sin su paso 0), para el procesador.
create function public.tareas_de_traspaso_pendientes(p_limite integer, p_company_id uuid default null)
returns table (company_id uuid, task_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select t.company_id, t.id from public.tasks t
   where t.handoff_id is not null and t.status = 'running' and (p_company_id is null or t.company_id = p_company_id)
     and not exists (select 1 from public.task_steps s where s.task_id = t.id and s.position = 0)
   order by t.started_at limit greatest(p_limite, 1)
$$;

revoke all on function public.agent_traspaso_crear(uuid, uuid, uuid, text, public.handoff_kind, text, jsonb, jsonb, text, uuid, uuid, text, integer, integer),
  public.tareas_de_traspaso_pendientes(integer, uuid) from public, anon, authenticated;
grant execute on function public.agent_traspaso_crear(uuid, uuid, uuid, text, public.handoff_kind, text, jsonb, jsonb, text, uuid, uuid, text, integer, integer),
  public.tareas_de_traspaso_pendientes(integer, uuid) to service_role;

-- La función antigua creaba traspasos sin tarea ni cobro: se retira (ya nada la usa).
drop function public.agent_create_handoff_a_agente(uuid, uuid, uuid, public.handoff_kind, text, jsonb, uuid);
