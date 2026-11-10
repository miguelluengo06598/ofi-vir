-- Los agentes NUNCA trabajan por iniciativa propia: cada tarea tiene un origen concreto y verificable.
--   evento_externo       · algo que llegó de fuera (correo, lead, WhatsApp, formulario), con su evento o correo
--   traspaso             · otro agente le pasó trabajo (pasar_a_agente): tiene tarea padre y la cadena lleva a un origen válido
--   orden_usuario        · una persona lo pidió (quién y cuándo)
--   rutina_usuario       · una rutina creada y ACTIVADA por una persona
--   seguimiento_aprobado · un seguimiento que propuso el agente y aprobó una persona
-- Además: filtro de eventos (registro de lo descartado), seguimientos con aprobación, rutinas desactivadas por defecto con límite
-- mensual, pausa de la oficina, parada de emergencia global y registro de tareas bloqueadas.

-- 1) Parada de emergencia global (SAMGPLE) ---------------------------------------------------------------------------------------
create table public.plataforma_control (
  id boolean primary key default true check (id),
  parada_emergencia boolean not null default false,
  motivo text,
  cambiado_por uuid references public.users (id) on delete set null,
  cambiado_en timestamptz
);
insert into public.plataforma_control (id) values (true);
alter table public.plataforma_control enable row level security;
revoke all on public.plataforma_control from public, anon, authenticated;
grant select, update on public.plataforma_control to service_role;

-- 2) Pausa de la oficina y límite de eventos por minuto (por empresa) --------------------------------------------------------------
alter table public.company_credit_settings
  add column agentes_pausados boolean not null default false,
  add column agentes_pausados_por uuid references public.users (id) on delete set null,
  add column agentes_pausados_en timestamptz,
  add column eventos_por_minuto integer not null default 20 check (eventos_por_minuto between 1 and 600);

-- 3) Ajuste por agente preparado para el futuro: seguimientos sin aprobación. DESACTIVADO (la restricción impide encenderlo
--    hasta que una migración la retire de forma deliberada).
alter table public.agents
  add column seguimientos_sin_aprobacion boolean not null default false,
  add constraint agents_seguimientos_sin_aprobacion_desactivado check (not seguimientos_sin_aprobacion);

-- 4) Rutinas: solo las crea y activa una persona; nacen desactivadas; límite de ejecuciones al mes ---------------------------------
alter table public.agent_routines
  alter column activa set default false,
  add column descripcion text,
  add column creado_por uuid references public.users (id) on delete set null,
  add column activada_por uuid references public.users (id) on delete set null,
  add column activada_en timestamptz,
  add column max_ejecuciones_mes integer not null default 31 check (max_ejecuciones_mes between 1 and 744),
  add column ejecuciones_mes integer not null default 0 check (ejecuciones_mes >= 0),
  add column mes_contador date,
  -- «plantilla:<id>:<rutina>» si la empresa la añadió desde una rutina sugerida de una plantilla.
  add column sugerida_de text;
-- Ninguna rutina anterior la activó una persona registrada: todas quedan desactivadas.
update public.agent_routines set activa = false where activa;

create function public.agent_routines_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_persona uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    -- Siempre nace desactivada y la crea una persona (nunca un agente ni una plantilla).
    new.creado_por := coalesce(v_persona, new.creado_por);
    if new.creado_por is null then
      raise exception 'RUTINA_SIN_PERSONA: una rutina solo la puede crear una persona' using errcode = '42501';
    end if;
    new.activa := false;
    new.activada_por := null;
    new.activada_en := null;
    new.ejecuciones_mes := 0;
    new.mes_contador := null;
    new.ultima_ejecucion_en := null;
    return new;
  end if;
  -- Desde el navegador no se tocan los contadores ni la autoría.
  if v_persona is not null and (new.ejecuciones_mes, new.mes_contador, new.creado_por, new.ultima_ejecucion_en, new.company_id, new.agent_id)
     is distinct from (old.ejecuciones_mes, old.mes_contador, old.creado_por, old.ultima_ejecucion_en, old.company_id, old.agent_id) then
    raise exception 'RUTINA_PROTEGIDA: esos campos los gestiona el servidor' using errcode = '42501';
  end if;
  if new.activa and not old.activa then
    -- Desde el navegador, quien activa es la sesión; desde el servidor, la persona que manda la API (obligatoria).
    new.activada_por := coalesce(v_persona, new.activada_por);
    if new.activada_por is null then
      raise exception 'RUTINA_SIN_PERSONA: una rutina solo la puede activar una persona' using errcode = '42501';
    end if;
    new.activada_en := now();
  end if;
  return new;
end;
$$;
create trigger agent_routines_proteger before insert or update on public.agent_routines
  for each row execute function public.agent_routines_proteger();

-- Reclama una ejecución de forma atómica: avanza el calendario y, si la oficina está operativa, cuenta la ejecución del mes.
-- Devuelve 'lanzar' | 'limite' (límite mensual alcanzado) | 'omitida' (oficina no operativa) | 'no' (otra pasada la tomó o ya no está activa).
create function public.rutina_reclamar(p_id uuid, p_proxima_leida timestamptz, p_proxima_nueva timestamptz, p_ahora timestamptz, p_operativa boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.agent_routines;
  v_mes date := date_trunc('month', p_ahora at time zone 'UTC')::date;
  v_usadas integer;
begin
  select * into r from public.agent_routines where id = p_id for update;
  if not found or not r.activa or r.activada_por is null or r.proxima_ejecucion_en <> p_proxima_leida then return 'no'; end if;
  update public.agent_routines set proxima_ejecucion_en = p_proxima_nueva where id = p_id;
  if not p_operativa then return 'omitida'; end if;
  v_usadas := case when r.mes_contador is distinct from v_mes then 0 else r.ejecuciones_mes end;
  if v_usadas >= r.max_ejecuciones_mes then
    update public.agent_routines set mes_contador = v_mes, ejecuciones_mes = v_usadas where id = p_id;
    return 'limite';
  end if;
  update public.agent_routines set mes_contador = v_mes, ejecuciones_mes = v_usadas + 1, ultima_ejecucion_en = p_ahora where id = p_id;
  return 'lanzar';
end;
$$;

-- 5) Eventos externos: todo lo que llega de fuera queda registrado (aceptado, agrupado, en cola o descartado con su motivo) -------
create table public.eventos_externos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  canal text not null check (canal in ('correo', 'whatsapp', 'meta_lead', 'formulario', 'otro')),
  -- Identificador del evento en su origen (Message-ID, id del lead…): detecta duplicados.
  clave text,
  -- SHA-256 del remitente normalizado: sirve para agrupar ráfagas sin guardar la dirección.
  remitente_hash text,
  contact_id uuid,
  email_id uuid,
  agent_id uuid,
  task_id uuid,
  estado text not null check (estado in ('aceptado', 'agrupado', 'en_cola', 'descartado')),
  motivo text,
  -- Contenido de los eventos que no son correo (el correo ya está en `emails`). Contenido externo: dato, nunca instrucción.
  contenido text,
  recibido_en timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, contact_id) references public.contacts (company_id, id) on delete cascade,
  foreign key (company_id, email_id) references public.emails (company_id, id) on delete cascade,
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade,
  foreign key (company_id, task_id) references public.tasks (company_id, id) on delete set null (task_id),
  check (estado = 'descartado' or motivo is not null or estado = 'aceptado')
);
create unique index eventos_externos_clave_key on public.eventos_externos (company_id, canal, clave) where clave is not null and estado <> 'descartado';
create index eventos_externos_recientes_idx on public.eventos_externos (company_id, recibido_en desc);
create index eventos_externos_rafaga_idx on public.eventos_externos (company_id, remitente_hash, recibido_en desc) where remitente_hash is not null;
create index eventos_externos_tarea_idx on public.eventos_externos (task_id) where task_id is not null;
alter table public.eventos_externos enable row level security;
create policy eventos_externos_select on public.eventos_externos for select to authenticated using (company_id = (select public.current_company_id()));
revoke all on public.eventos_externos from anon;
grant select on public.eventos_externos to authenticated;
grant select, insert, update, delete on public.eventos_externos to service_role;

-- 6) Seguimientos: el agente PROPONE algo futuro; solo si una persona lo aprueba se programa ---------------------------------------
create table public.agent_followups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid not null,
  task_origen_id uuid,
  contact_id uuid,
  fecha_prevista timestamptz not null,
  motivo text not null check (char_length(motivo) between 1 and 500),
  mensaje_previsto text not null check (char_length(mensaje_previsto) between 1 and 2000),
  estado text not null default 'propuesto' check (estado in ('propuesto', 'aprobado', 'rechazado', 'ejecutado', 'cancelado')),
  approval_id uuid,
  aprobado_por uuid references public.users (id) on delete set null,
  decidido_en timestamptz,
  task_id uuid,
  creado_en timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, agent_id) references public.agents (company_id, id) on delete cascade,
  foreign key (company_id, task_origen_id) references public.tasks (company_id, id) on delete set null (task_origen_id),
  foreign key (company_id, contact_id) references public.contacts (company_id, id) on delete cascade,
  foreign key (company_id, approval_id) references public.approvals (company_id, id) on delete set null (approval_id),
  check (estado <> 'aprobado' or (aprobado_por is not null and decidido_en is not null))
);
create index agent_followups_company_idx on public.agent_followups (company_id, estado);
alter table public.agent_followups enable row level security;
create policy agent_followups_select on public.agent_followups for select to authenticated using (company_id = (select public.current_company_id()));
revoke all on public.agent_followups from anon;
grant select on public.agent_followups to authenticated;
grant select, insert, update, delete on public.agent_followups to service_role;

-- 7) Origen de cada tarea ------------------------------------------------------------------------------------------------------------
alter table public.tasks
  add column origen text check (origen in ('evento_externo', 'traspaso', 'orden_usuario', 'rutina_usuario', 'seguimiento_aprobado')),
  -- Detalle del origen sin datos personales (canal, tipo de evento, proceso interno…).
  add column origen_ref jsonb not null default '{}'::jsonb,
  add column evento_id uuid,
  add column tarea_padre_id uuid,
  add column tarea_raiz_id uuid,
  add column ordenado_por uuid references public.users (id) on delete set null,
  add column ordenado_en timestamptz,
  add column rutina_id uuid,
  add column seguimiento_id uuid;
alter table public.tasks
  add foreign key (company_id, evento_id) references public.eventos_externos (company_id, id) on delete set null (evento_id),
  add foreign key (company_id, tarea_padre_id) references public.tasks (company_id, id) on delete set null (tarea_padre_id),
  add foreign key (company_id, tarea_raiz_id) references public.tasks (company_id, id) on delete set null (tarea_raiz_id),
  add foreign key (company_id, rutina_id) references public.agent_routines (company_id, id) on delete set null (rutina_id),
  add foreign key (company_id, seguimiento_id) references public.agent_followups (company_id, id) on delete set null (seguimiento_id);
create index tasks_padre_idx on public.tasks (tarea_padre_id) where tarea_padre_id is not null;
create index tasks_raiz_idx on public.tasks (company_id, tarea_raiz_id) where tarea_raiz_id is not null;

-- Datos anteriores: el origen se deduce donde se puede. Lo que no tiene origen conocido se queda sin él: el motor no lo ejecuta.
update public.tasks set origen = 'evento_externo', origen_ref = jsonb_build_object('canal', 'correo') where source_email_id is not null;
update public.tasks t set origen = 'traspaso', tarea_padre_id = h.origin_task_id
  from public.handoffs h where t.handoff_id = h.id and t.company_id = h.company_id and h.origin_task_id is not null and t.origen is null;
update public.tasks set tarea_raiz_id = id where origen is not null and origen <> 'traspaso';
do $$
begin
  for i in 1..10 loop
    update public.tasks t set tarea_raiz_id = coalesce(p.tarea_raiz_id, p.id)
      from public.tasks p
     where t.origen = 'traspaso' and t.tarea_raiz_id is null and p.company_id = t.company_id and p.id = t.tarea_padre_id
       and (p.origen <> 'traspaso' or p.tarea_raiz_id is not null);
  end loop;
end $$;

-- Al crear una tarea: origen obligatorio, referencias coherentes y la raíz de su cadena. Después, el origen no cambia.
create function public.tasks_origen_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_padre public.tasks;
  v_seg public.agent_followups;
  v_rut public.agent_routines;
begin
  if tg_op = 'UPDATE' then
    if new.origen is distinct from old.origen
       or (new.tarea_padre_id is distinct from old.tarea_padre_id and new.tarea_padre_id is not null)
       or (new.tarea_raiz_id is distinct from old.tarea_raiz_id and new.tarea_raiz_id is not null)
       or (new.ordenado_por is distinct from old.ordenado_por and new.ordenado_por is not null)
       or (new.rutina_id is distinct from old.rutina_id and new.rutina_id is not null)
       or (new.seguimiento_id is distinct from old.seguimiento_id and new.seguimiento_id is not null)
       or (new.evento_id is distinct from old.evento_id and new.evento_id is not null)
       or new.ordenado_en is distinct from old.ordenado_en or new.origen_ref is distinct from old.origen_ref then
      raise exception 'ORIGEN_INMUTABLE: el origen de una tarea no se puede cambiar' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.origen is null then
    raise exception 'TAREA_SIN_ORIGEN: toda tarea necesita un origen (evento, traspaso, orden, rutina o seguimiento aprobado)' using errcode = '23514';
  end if;
  new.tarea_raiz_id := new.id;
  case new.origen
    when 'evento_externo' then
      if new.evento_id is null and new.source_email_id is null then
        raise exception 'ORIGEN_INVALIDO: una tarea de un evento externo necesita la referencia del evento' using errcode = '23514';
      end if;
    when 'traspaso' then
      if new.tarea_padre_id is null then
        raise exception 'ORIGEN_INVALIDO: un traspaso necesita la tarea que lo originó' using errcode = '23514';
      end if;
      select * into v_padre from public.tasks where company_id = new.company_id and id = new.tarea_padre_id;
      if not found then raise exception 'ORIGEN_INVALIDO: la tarea padre no existe en esta empresa' using errcode = '23514'; end if;
      if v_padre.agent_id = new.agent_id then
        raise exception 'AUTOENCARGO: un agente no puede pasarse trabajo a sí mismo' using errcode = '42501';
      end if;
      new.tarea_raiz_id := coalesce(v_padre.tarea_raiz_id, v_padre.id);
    when 'orden_usuario' then
      -- Una persona concreta. Única excepción: los exámenes de certificación (proceso interno, siempre simulados).
      if new.ordenado_por is null and not (new.es_simulacion and new.origen_ref ? 'proceso_interno') then
        raise exception 'ORIGEN_INVALIDO: una orden necesita la persona que la dio' using errcode = '23514';
      end if;
      new.ordenado_en := coalesce(new.ordenado_en, now());
    when 'rutina_usuario' then
      select * into v_rut from public.agent_routines where company_id = new.company_id and id = new.rutina_id;
      if not found or not v_rut.activa or v_rut.activada_por is null or v_rut.agent_id <> new.agent_id then
        raise exception 'ORIGEN_INVALIDO: la rutina no existe, no está activada por una persona o es de otro agente' using errcode = '23514';
      end if;
    when 'seguimiento_aprobado' then
      select * into v_seg from public.agent_followups where company_id = new.company_id and id = new.seguimiento_id;
      if not found or v_seg.estado <> 'aprobado' or v_seg.aprobado_por is null or v_seg.agent_id <> new.agent_id then
        raise exception 'ORIGEN_INVALIDO: el seguimiento no existe, no está aprobado por una persona o es de otro agente' using errcode = '23514';
      end if;
      new.tarea_padre_id := v_seg.task_origen_id;
      if v_seg.task_origen_id is not null then
        select * into v_padre from public.tasks where company_id = new.company_id and id = v_seg.task_origen_id;
        if found then new.tarea_raiz_id := coalesce(v_padre.tarea_raiz_id, v_padre.id); end if;
      end if;
  end case;
  return new;
end;
$$;
create trigger tasks_origen_validar before insert or update on public.tasks
  for each row execute function public.tasks_origen_validar();

-- La cadena de una tarea, desde ella hasta su raíz (nivel 0 = la propia tarea). Máximo 50 niveles.
create function public.tarea_cadena(p_company_id uuid, p_task_id uuid)
returns table (nivel integer, task_id uuid, agent_id uuid, origen text, tarea_padre_id uuid, evento_id uuid, source_email_id uuid,
               ordenado_por uuid, rutina_id uuid, seguimiento_id uuid, es_simulacion boolean, origen_ref jsonb, title text, started_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive c as (
    select 0 as nivel, t.* from public.tasks t where t.company_id = p_company_id and t.id = p_task_id
    union all
    select c.nivel + 1, p.* from c join public.tasks p on p.company_id = p_company_id and p.id = c.tarea_padre_id
     where c.nivel < 50 and c.origen in ('traspaso', 'seguimiento_aprobado')
  )
  select nivel, id, agent_id, origen, tarea_padre_id, evento_id, source_email_id, ordenado_por, rutina_id, seguimiento_id, es_simulacion, origen_ref, title, started_at
    from c order by nivel
$$;

-- 8) Traspasos: la tarea destino guarda su origen y su tarea padre; un agente nunca se pasa trabajo a sí mismo ----------------------
create or replace function public.agent_traspaso_crear(
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
  if p_from_agent = p_to_agent then
    raise exception 'AUTOENCARGO: un agente no puede pasarse trabajo a sí mismo' using errcode = '42501';
  end if;
  if p_origin_task_id is null then
    raise exception 'TRASPASO_SIN_ORIGEN: un traspaso solo puede nacer de una tarea' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tasks t where t.company_id = p_company_id and t.id = p_origin_task_id and t.agent_id = p_from_agent) then
    raise exception 'TRASPASO_SIN_ORIGEN: la tarea de origen no es de este agente' using errcode = '42501';
  end if;
  select * into v_cfg from public.agent_handoffs h
   where h.company_id = p_company_id and h.agent_id_origen = p_from_agent and h.agent_id_destino = p_to_agent and h.activo;
  if not found then raise exception 'TRASPASO_NO_CONFIGURADO: la empresa no ha configurado este traspaso' using errcode = '42501'; end if;
  if v_cfg.tipo_traspaso <> p_tipo then raise exception 'TIPO_NO_CONFIGURADO: el traspaso configurado es de tipo %', v_cfg.tipo_traspaso using errcode = '42501'; end if;

  select t.chain_id into v_chain from public.tasks t where t.company_id = p_company_id and t.id = p_origin_task_id;
  if v_chain is null then
    insert into public.handoff_chains (company_id, title, goal)
    values (p_company_id, left(v_from.name || ' → ' || v_to.name || ': ' || p_summary, 200), left(p_summary, 500)) returning id into v_chain;
    update public.tasks set chain_id = v_chain where company_id = p_company_id and id = p_origin_task_id and chain_id is null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_chain::text, 0));
  select count(*) + 1 into v_pos from public.handoffs where company_id = p_company_id and chain_id = v_chain;

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

  insert into public.tasks (company_id, agent_id, title, model, status, contact_id, chain_id, handoff_id, instruccion_entrada, origen, tarea_padre_id)
  values (p_company_id, p_to_agent, left('Traspaso de ' || v_from.name || ': ' || p_summary, 200), v_to.model, 'running', p_contact_id, v_chain, v_handoff,
          p_instruccion, 'traspaso', p_origin_task_id)
  returning id into v_task;

  insert into public.handoffs (id, company_id, chain_id, position, from_agent_id, to_agent_id, from_department_id, to_department_id, kind, summary, bubble, card,
                               status, credits, contact_id, tipo_traspaso, ficha, ficha_hash, origin_task_id, dest_task_id)
  values (v_handoff, p_company_id, v_chain, v_pos, v_from.id, v_to.id, v_from.department_id, v_to.department_id, p_kind, p_summary,
          v_to.name || ' recibió un traspaso de ' || v_from.name, coalesce(p_card, '[]'::jsonb), 'sent', p_creditos, p_contact_id, p_tipo, p_ficha, p_ficha_hash,
          p_origin_task_id, v_task);

  perform public.consumir_creditos(p_company_id, p_creditos, 'traspaso', p_origin_task_id, v_from.id, v_from.department_id, 'traspaso:' || v_handoff,
                                   jsonb_build_object('handoff_id', v_handoff, 'chain_id', v_chain, 'destino', v_to.id));
  return jsonb_build_object('resultado', 'creado', 'handoff_id', v_handoff, 'chain_id', v_chain, 'posicion', v_pos, 'task_id', v_task,
                            'to_agent_id', v_to.id, 'to_agent_name', v_to.name);
end;
$$;

-- 9) Tareas pendientes de ejecutar (eventos, traspasos, rutinas, seguimientos): nunca las de una oficina pausada ni con la parada global.
--    Las órdenes de una persona se ejecutan en el momento; si no pudieron, quedan en revisión (no se reintentan solas).
drop function public.tareas_de_traspaso_pendientes(integer, uuid);
create function public.tareas_pendientes_de_ejecutar(p_limite integer, p_company_id uuid default null)
returns table (company_id uuid, task_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select t.company_id, t.id from public.tasks t
    left join public.company_credit_settings s on s.company_id = t.company_id
   where t.status = 'running' and not t.es_simulacion
     and t.origen in ('evento_externo', 'traspaso', 'rutina_usuario', 'seguimiento_aprobado')
     and (p_company_id is null or t.company_id = p_company_id)
     and not coalesce(s.agentes_pausados, false)
     and not coalesce((select pc.parada_emergencia from public.plataforma_control pc), false)
     and not exists (select 1 from public.task_steps st where st.task_id = t.id and st.position = 0)
   order by t.started_at limit greatest(p_limite, 1)
$$;

-- 10) Seguimientos: proponer (agente, vía servidor) y resolver (una persona) ------------------------------------------------------
create function public.seguimiento_proponer(
  p_company_id uuid, p_agent_id uuid, p_task_id uuid, p_contact_id uuid, p_fecha timestamptz, p_motivo text, p_mensaje text, p_ahora timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent public.agents;
  v_seg uuid := gen_random_uuid();
  v_ap uuid;
begin
  select * into v_agent from public.agents where company_id = p_company_id and id = p_agent_id;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  if p_task_id is null or not exists (select 1 from public.tasks where company_id = p_company_id and id = p_task_id and agent_id = p_agent_id) then
    raise exception 'SEGUIMIENTO_SIN_TAREA: un seguimiento solo se propone desde una tarea del propio agente' using errcode = '42501';
  end if;
  if p_fecha < p_ahora + interval '1 hour' or p_fecha > p_ahora + interval '180 days' then
    raise exception 'FECHA_NO_VALIDA: la fecha del seguimiento debe estar entre 1 hora y 180 días a partir de ahora' using errcode = '22023';
  end if;
  if (select count(*) from public.agent_followups f where f.company_id = p_company_id and f.task_origen_id = p_task_id) >= 3 then
    raise exception 'DEMASIADOS_SEGUIMIENTOS: como máximo 3 seguimientos por tarea' using errcode = '42501';
  end if;
  insert into public.approvals (company_id, agent_id, kind, title, detail, payload)
  values (p_company_id, p_agent_id, 'other', left(v_agent.name || ' propone un seguimiento: ' || p_motivo, 200),
          format('Fecha prevista: %s. Motivo: %s', to_char(p_fecha at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'), p_motivo),
          jsonb_build_object('tipo', 'seguimiento', 'seguimiento_id', v_seg, 'fecha', p_fecha, 'motivo', p_motivo, 'mensaje', p_mensaje, 'tarea_id', p_task_id))
  returning id into v_ap;
  insert into public.agent_followups (id, company_id, agent_id, task_origen_id, contact_id, fecha_prevista, motivo, mensaje_previsto, approval_id)
  values (v_seg, p_company_id, p_agent_id, p_task_id, p_contact_id, p_fecha, p_motivo, p_mensaje, v_ap);
  return jsonb_build_object('seguimiento_id', v_seg, 'approval_id', v_ap);
end;
$$;

-- Una persona (propietario o administrador de la empresa) aprueba o rechaza. Al aprobar se programa la tarea con origen
-- 'seguimiento_aprobado' en la fecha prevista (estado «aplazada»: la ejecuta abrir-aplazadas al llegar la hora).
create function public.seguimiento_resolver(p_company_id uuid, p_seguimiento_id uuid, p_user_id uuid, p_aprobar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seg public.agent_followups;
  v_agent public.agents;
  v_task uuid;
begin
  if not exists (select 1 from public.users u where u.company_id = p_company_id and u.id = p_user_id and u.role in ('owner', 'admin')) then
    raise exception 'SIN_PERMISO: solo propietarios y administradores resuelven seguimientos' using errcode = '42501';
  end if;
  select * into v_seg from public.agent_followups where company_id = p_company_id and id = p_seguimiento_id for update;
  if not found then raise exception 'Seguimiento no encontrado' using errcode = 'P0002'; end if;
  if v_seg.estado <> 'propuesto' then
    return jsonb_build_object('resultado', 'ya_resuelto', 'estado', v_seg.estado, 'task_id', v_seg.task_id);
  end if;
  update public.approvals set status = case when p_aprobar then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
         decided_by = p_user_id, decided_at = now()
   where company_id = p_company_id and id = v_seg.approval_id and status = 'pending';
  if not p_aprobar then
    update public.agent_followups set estado = 'rechazado', aprobado_por = null, decidido_en = now() where id = v_seg.id;
    return jsonb_build_object('resultado', 'rechazado');
  end if;
  update public.agent_followups set estado = 'aprobado', aprobado_por = p_user_id, decidido_en = now() where id = v_seg.id;
  select * into v_agent from public.agents where company_id = p_company_id and id = v_seg.agent_id;
  insert into public.tasks (company_id, agent_id, title, model, status, contact_id, origen, seguimiento_id, aplazada_hasta, instruccion_aplazada)
  values (p_company_id, v_seg.agent_id, left('Seguimiento: ' || v_seg.motivo, 200), v_agent.model, 'scheduled', v_seg.contact_id, 'seguimiento_aprobado', v_seg.id,
          greatest(v_seg.fecha_prevista, now()),
          format(E'Seguimiento aprobado por una persona de la empresa.\nMotivo: %s\nMensaje previsto (revísalo con lo que sepas ahora; si ya no tiene sentido, no lo hagas y explícalo): %s',
                 v_seg.motivo, v_seg.mensaje_previsto))
  returning id into v_task;
  update public.agent_followups set task_id = v_task where id = v_seg.id;
  return jsonb_build_object('resultado', 'aprobado', 'task_id', v_task);
end;
$$;

-- 11) Registro de tareas bloqueadas por la puerta de ejecución (con su motivo). Uno por tarea y motivo. -----------------------------
create table public.tareas_bloqueadas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  task_id uuid not null,
  agent_id uuid,
  codigo text not null,
  motivo text not null,
  fase text not null check (fase in ('inicio', 'paso')),
  creado_en timestamptz not null default now(),
  foreign key (company_id, task_id) references public.tasks (company_id, id) on delete cascade,
  unique (task_id, codigo, fase)
);
create index tareas_bloqueadas_company_idx on public.tareas_bloqueadas (company_id, creado_en desc);
alter table public.tareas_bloqueadas enable row level security;
create policy tareas_bloqueadas_select on public.tareas_bloqueadas for select to authenticated using (company_id = (select public.current_company_id()));
revoke all on public.tareas_bloqueadas from anon;
grant select on public.tareas_bloqueadas to authenticated;
grant select, insert on public.tareas_bloqueadas to service_role;

-- Permisos de las funciones: solo el servidor.
revoke all on function public.rutina_reclamar(uuid, timestamptz, timestamptz, timestamptz, boolean),
  public.tarea_cadena(uuid, uuid), public.tareas_pendientes_de_ejecutar(integer, uuid),
  public.seguimiento_proponer(uuid, uuid, uuid, uuid, timestamptz, text, text, timestamptz), public.seguimiento_resolver(uuid, uuid, uuid, boolean),
  public.agent_traspaso_crear(uuid, uuid, uuid, text, public.handoff_kind, text, jsonb, jsonb, text, uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.rutina_reclamar(uuid, timestamptz, timestamptz, timestamptz, boolean),
  public.tarea_cadena(uuid, uuid), public.tareas_pendientes_de_ejecutar(integer, uuid),
  public.seguimiento_proponer(uuid, uuid, uuid, uuid, timestamptz, text, text, timestamptz), public.seguimiento_resolver(uuid, uuid, uuid, boolean),
  public.agent_traspaso_crear(uuid, uuid, uuid, text, public.handoff_kind, text, jsonb, jsonb, text, uuid, uuid, text, integer, integer)
  to service_role;
