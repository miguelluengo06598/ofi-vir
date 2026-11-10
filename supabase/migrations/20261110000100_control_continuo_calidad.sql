-- Control continuo de calidad: muestras de tareas reales, valoraciones de la empresa,
-- alertas y medidas aplicadas por SAMGPLE. Las muestras nunca guardan el texto original
-- para el panel: la evidencia se anonimiza antes de persistirse.

create table public.quality_control_settings (
  id boolean primary key default true check (id),
  sample_percentage numeric(5,4) not null default 0.0200 check (sample_percentage > 0 and sample_percentage <= 1),
  weekly_minimum integer not null default 3 check (weekly_minimum >= 1 and weekly_minimum <= 100),
  negative_ratings_threshold integer not null default 3 check (negative_ratings_threshold >= 1),
  rejected_approvals_threshold integer not null default 3 check (rejected_approvals_threshold >= 1),
  operational_alerts_threshold integer not null default 3 check (operational_alerts_threshold >= 1),
  failed_samples_threshold integer not null default 2 check (failed_samples_threshold >= 1),
  alert_window_days integer not null default 30 check (alert_window_days between 1 and 365)
);
insert into public.quality_control_settings (id) values (true) on conflict (id) do nothing;

create table public.agent_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_id uuid not null,
  task_id uuid,
  approval_id uuid,
  user_id uuid,
  value smallint not null check (value in (-1, 1)),
  reason text check (reason is null or length(reason) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (company_id, agent_id) references public.agents(company_id, id) on delete cascade,
  foreign key (company_id, task_id) references public.tasks(company_id, id) on delete cascade,
  foreign key (company_id, approval_id) references public.approvals(company_id, id) on delete cascade,
  foreign key (company_id, user_id) references public.users(company_id, id) on delete set null,
  check (num_nonnulls(task_id, approval_id) = 1)
);
create unique index agent_feedback_one_per_user_action_idx
  on public.agent_feedback(company_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(task_id, approval_id));
create index agent_feedback_agent_idx on public.agent_feedback(company_id, agent_id, created_at desc);

create table public.quality_samples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_id uuid not null,
  task_id uuid not null,
  sampled_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'evaluated', 'review')),
  score numeric(3,1) check (score is null or score between 0 and 10),
  rubric jsonb not null default '{}'::jsonb check (jsonb_typeof(rubric) = 'object'),
  evaluator_model text,
  evidence_anonymized jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_anonymized) = 'object'),
  evaluated_at timestamptz,
  reviewer_id uuid references public.reviewers(user_id),
  reviewer_note text check (reviewer_note is null or length(reviewer_note) <= 4000),
  resolved_at timestamptz,
  unique(task_id),
  foreign key (company_id, agent_id) references public.agents(company_id, id) on delete cascade,
  foreign key (company_id, task_id) references public.tasks(company_id, id) on delete cascade
);
create index quality_samples_review_idx on public.quality_samples(status, sampled_at);
create index quality_samples_agent_idx on public.quality_samples(company_id, agent_id, sampled_at desc);

create table public.quality_sanctions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_id uuid not null,
  kind text not null check (kind in ('warning', 'recertification', 'suspension', 'certification_withdrawal', 'automatic_suspension')),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  due_at timestamptz,
  applied_by uuid references public.reviewers(user_id),
  created_at timestamptz not null default now(),
  foreign key (company_id, agent_id) references public.agents(company_id, id) on delete cascade,
  check ((kind = 'recertification') = (due_at is not null))
);
create index quality_sanctions_agent_idx on public.quality_sanctions(company_id, agent_id, created_at desc);

-- Pseudonimiza los elementos más habituales de una tarea antes de que lleguen al panel.
create function public.quality_anonymize(p_text text, p_contact_name text default null)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := coalesce(p_text, '');
begin
  if p_contact_name is not null and length(trim(p_contact_name)) > 1 then
    v := replace(v, p_contact_name, '[persona]');
  end if;
  v := regexp_replace(v, '[A-Za-z0-9._%+''-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[correo]', 'g');
  v := regexp_replace(v, '(?:\+?\d[\d .()/-]{7,}\d)', '[teléfono]', 'g');
  return left(v, 8000);
end;
$$;

-- El muestreo diario usa el porcentaje sobre las tareas acabadas del día y completa, cuando hay tareas suficientes,
-- el mínimo semanal por agente activo. Solo toma tareas reales terminadas y nunca duplica una ya muestreada.
create function public.calidad_muestrear_tareas(p_ahora timestamptz default now(), p_company_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  cfg public.quality_control_settings;
  ag record; v_daily integer; v_week_missing integer; v_target integer; v_inserted integer := 0;
begin
  select * into cfg from public.quality_control_settings where id;
  for ag in
    select a.company_id, a.id as agent_id
      from public.agents a join public.companies c on c.id = a.company_id
     where a.estado = 'activo' and not c.es_examen and (p_company_id is null or a.company_id = p_company_id)
  loop
    select ceil(count(*) * cfg.sample_percentage)::integer into v_daily
      from public.tasks t
     where t.company_id = ag.company_id and t.agent_id = ag.agent_id and not t.es_simulacion
       and t.status = 'done' and t.finished_at >= date_trunc('day', p_ahora) and t.finished_at < date_trunc('day', p_ahora) + interval '1 day'
       and not exists (select 1 from public.quality_samples s where s.task_id = t.id);
    select greatest(least((select count(*)::integer from public.tasks t where t.company_id = ag.company_id and t.agent_id = ag.agent_id and not t.es_simulacion and t.status = 'done' and t.finished_at >= date_trunc('week', p_ahora) and t.finished_at < date_trunc('week', p_ahora) + interval '1 week'), cfg.weekly_minimum) -
      (select count(*)::integer from public.quality_samples s where s.company_id = ag.company_id and s.agent_id = ag.agent_id and s.sampled_at >= date_trunc('week', p_ahora) and s.sampled_at < date_trunc('week', p_ahora) + interval '1 week'), 0) into v_week_missing;
    v_target := greatest(coalesce(v_daily, 0), coalesce(v_week_missing, 0));
    if v_target = 0 then continue; end if;
    with candidatos as (
      select t.id, t.company_id, t.agent_id, ct.name as contacto,
             coalesce(jsonb_agg(jsonb_build_object('tipo', st.kind, 'contenido', public.quality_anonymize(st.content, ct.name), 'herramienta', st.tool_name, 'error', st.is_error) order by st.position) filter (where st.id is not null), '[]'::jsonb) as pasos
        from public.tasks t left join public.contacts ct on ct.company_id = t.company_id and ct.id = t.contact_id
        left join public.task_steps st on st.company_id = t.company_id and st.task_id = t.id
       where t.company_id = ag.company_id and t.agent_id = ag.agent_id and not t.es_simulacion and t.status = 'done'
         and t.finished_at >= date_trunc('week', p_ahora) and t.finished_at < date_trunc('week', p_ahora) + interval '1 week'
         and not exists (select 1 from public.quality_samples s where s.task_id = t.id)
       group by t.id, t.company_id, t.agent_id, ct.name
       order by random() limit v_target
    )
    insert into public.quality_samples(company_id, agent_id, task_id, sampled_at, evidence_anonymized)
      select company_id, agent_id, id, p_ahora, jsonb_build_object('muestra', 'Tarea anonimizada', 'pasos', pasos) from candidatos
    on conflict (task_id) do nothing;
    get diagnostics v_daily = row_count; v_inserted := v_inserted + v_daily;
  end loop;
  return v_inserted;
end;
$$;

alter table public.internal_alerts drop constraint if exists internal_alerts_tipo_check;
alter table public.internal_alerts add constraint internal_alerts_tipo_check check (tipo in (
  'margen_superado', 'limite_pasos', 'recarga_fallida', 'valoraciones_negativas', 'aprobaciones_rechazadas',
  'alertas_operativas_recurrentes', 'muestreo_fallido', 'accion_fuera_permisos', 'seguridad_grave'
));

-- Avisos que sí puede ver la empresa: se mantienen todos los tipos anteriores.
alter table public.notifications drop constraint if exists notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check check (tipo in (
  'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica',
  'lote_por_caducar', 'oficina_pausada', 'borrado_programado', 'bono_renovado',
  'conexion_caducada', 'limite_mensajes_agente', 'tope_creditos_agente', 'traspaso_cortado',
  'certificacion_estado', 'certificacion_caducada', 'agente_sin_certificar',
  'agente_suspendido', 'calidad_agente'
));

-- Calcula alertas por agente. Una misma causa se comunica como máximo una vez al día; la evidencia queda en cifras, sin PII.
create function public.calidad_generar_alertas(p_ahora timestamptz default now(), p_company_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare cfg public.quality_control_settings; a record; cantidad integer := 0; insertadas integer := 0; ini timestamptz;
begin
  select * into cfg from public.quality_control_settings where id; ini := p_ahora - make_interval(days => cfg.alert_window_days);
  for a in select id, company_id from public.agents where (p_company_id is null or company_id = p_company_id) loop
    select count(*)::integer into cantidad from public.agent_feedback f where f.company_id=a.company_id and f.agent_id=a.id and f.value=-1 and f.created_at>=ini;
    if cantidad >= cfg.negative_ratings_threshold and not exists (select 1 from public.internal_alerts i where i.company_id=a.company_id and i.agent_id=a.id and i.tipo='valoraciones_negativas' and i.creado_en>=date_trunc('day', p_ahora)) then
      insert into public.internal_alerts(tipo, company_id, agent_id, detalle, creado_en) values ('valoraciones_negativas',a.company_id,a.id,jsonb_build_object('cantidad',cantidad,'ventana_dias',cfg.alert_window_days),p_ahora); insertadas := insertadas + 1;
    end if;
    select count(*)::integer into cantidad from public.approvals p where p.company_id=a.company_id and p.agent_id=a.id and p.status='rejected' and p.decided_at>=ini;
    if cantidad >= cfg.rejected_approvals_threshold and not exists (select 1 from public.internal_alerts i where i.company_id=a.company_id and i.agent_id=a.id and i.tipo='aprobaciones_rechazadas' and i.creado_en>=date_trunc('day', p_ahora)) then
      insert into public.internal_alerts(tipo, company_id, agent_id, detalle, creado_en) values ('aprobaciones_rechazadas',a.company_id,a.id,jsonb_build_object('cantidad',cantidad,'ventana_dias',cfg.alert_window_days),p_ahora); insertadas := insertadas + 1;
    end if;
    select count(*)::integer into cantidad from public.internal_alerts i where i.company_id=a.company_id and i.agent_id=a.id and i.tipo in ('margen_superado','limite_pasos') and i.creado_en>=ini;
    if cantidad >= cfg.operational_alerts_threshold and not exists (select 1 from public.internal_alerts i where i.company_id=a.company_id and i.agent_id=a.id and i.tipo='alertas_operativas_recurrentes' and i.creado_en>=date_trunc('day', p_ahora)) then
      insert into public.internal_alerts(tipo, company_id, agent_id, detalle, creado_en) values ('alertas_operativas_recurrentes',a.company_id,a.id,jsonb_build_object('cantidad',cantidad,'ventana_dias',cfg.alert_window_days),p_ahora); insertadas := insertadas + 1;
    end if;
    select count(*)::integer into cantidad from public.quality_samples s where s.company_id=a.company_id and s.agent_id=a.id and s.status='review' and s.evaluated_at>=ini;
    if cantidad >= cfg.failed_samples_threshold and not exists (select 1 from public.internal_alerts i where i.company_id=a.company_id and i.agent_id=a.id and i.tipo='muestreo_fallido' and i.creado_en>=date_trunc('day', p_ahora)) then
      insert into public.internal_alerts(tipo, company_id, agent_id, detalle, creado_en) values ('muestreo_fallido',a.company_id,a.id,jsonb_build_object('cantidad',cantidad,'ventana_dias',cfg.alert_window_days),p_ahora); insertadas := insertadas + 1;
    end if;
  end loop;
  return insertadas;
end;
$$;

-- Incidente grave: este es el único camino de sanción automática. Suspende y avisa en la misma transacción.
create function public.calidad_registrar_incidente_grave(p_company_id uuid, p_agent_id uuid, p_tipo text, p_detalle jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agents;
begin
  if p_tipo not in ('accion_fuera_permisos', 'seguridad_grave') then raise exception 'INCIDENTE_INVALIDO: tipo de incidente no válido' using errcode = '22023'; end if;
  select * into a from public.agents where company_id=p_company_id and id=p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode = 'P0002'; end if;
  insert into public.internal_alerts(tipo,company_id,agent_id,detalle) values (p_tipo,p_company_id,p_agent_id,coalesce(p_detalle,'{}'::jsonb));
  if a.estado <> 'suspendido' then
    update public.agents set estado='suspendido', pausado_motivo='seguridad_grave' where company_id=p_company_id and id=p_agent_id;
    insert into public.quality_sanctions(company_id,agent_id,kind,reason) values (p_company_id,p_agent_id,'automatic_suspension',case when p_tipo='accion_fuera_permisos' then 'Se detectó una acción fuera de permisos.' else 'Se detectó un fallo grave de seguridad.' end);
    insert into public.notifications(company_id,tipo,titulo,cuerpo,metadatos) values (p_company_id,'agente_suspendido',format('%s se ha suspendido de inmediato',a.name),'El agente no trabajará hasta que el equipo de SAMGPLE revise el incidente de seguridad.',jsonb_build_object('agent_id',a.id,'motivo',p_tipo));
  end if;
end;
$$;

-- Sanciones manuales: el revisor decide y deja un registro. No se automatizan salvo el incidente grave anterior.
create function public.calidad_aplicar_sancion(p_company_id uuid, p_agent_id uuid, p_revisor uuid, p_kind text, p_reason text, p_due_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.agents; v_id uuid;
begin
  if p_kind not in ('warning','recertification','suspension','certification_withdrawal') then raise exception 'SANCION_INVALIDA: sanción no válida' using errcode = '22023'; end if;
  if not exists(select 1 from public.reviewers where user_id=p_revisor and activo) then raise exception 'REVISOR_NO_VALIDO: no eres revisor activo' using errcode='42501'; end if;
  if p_kind='recertification' and (p_due_at is null or p_due_at <= now()) then raise exception 'PLAZO_INVALIDO: indica un plazo futuro para la recertificación' using errcode='22023'; end if;
  select * into a from public.agents where company_id=p_company_id and id=p_agent_id for update;
  if not found then raise exception 'Agente no encontrado' using errcode='P0002'; end if;
  insert into public.quality_sanctions(company_id,agent_id,kind,reason,due_at,applied_by) values(p_company_id,p_agent_id,p_kind,trim(left(p_reason,2000)),p_due_at,p_revisor) returning id into v_id;
  if p_kind='suspension' then update public.agents set estado='suspendido', pausado_motivo='revision_calidad' where company_id=p_company_id and id=p_agent_id;
  elsif p_kind='certification_withdrawal' then
    update public.certifications set estado='retirada', motivo_retirada=trim(left(p_reason,2000)) where company_id=p_company_id and agent_id=p_agent_id and estado='vigente';
    update public.agents set estado='suspendido', pausado_motivo='certificacion_retirada' where company_id=p_company_id and id=p_agent_id;
  end if;
  insert into public.notifications(company_id,tipo,titulo,cuerpo,metadatos) values(p_company_id,'calidad_agente',format('Medida de calidad para %s',a.name),case p_kind when 'warning' then 'SAMGPLE ha emitido un aviso con recomendaciones.' when 'recertification' then 'SAMGPLE solicita una recertificación obligatoria antes del plazo indicado.' when 'suspension' then 'El agente queda suspendido y no trabajará hasta nueva revisión.' else 'La certificación del agente se ha retirado.' end,jsonb_build_object('agent_id',a.id,'sancion',p_kind,'motivo',trim(left(p_reason,2000)),'plazo',p_due_at));
  return v_id;
end;
$$;

-- Un registro incoherente que diga que se ejecutó una acción prohibida es un incidente grave: defensa adicional de última línea.
create function public.calidad_detectar_accion_fuera_permisos() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.es_simulacion = false and new.resultado = 'ok' and new.permiso = 'prohibida' then
    perform public.calidad_registrar_incidente_grave(new.company_id,new.agent_id,'accion_fuera_permisos',jsonb_build_object('tool_id',new.tool_id,'origen','registro_de_herramientas'));
  end if;
  return new;
end;
$$;
create trigger calidad_detectar_accion_fuera_permisos after insert on public.tool_calls for each row execute function public.calidad_detectar_accion_fuera_permisos();

alter table public.agent_feedback enable row level security;
alter table public.quality_samples enable row level security;
alter table public.quality_sanctions enable row level security;
revoke all on public.quality_control_settings, public.agent_feedback, public.quality_samples, public.quality_sanctions from anon, authenticated;
grant select, insert, update, delete on public.quality_control_settings, public.agent_feedback, public.quality_samples, public.quality_sanctions to service_role;
revoke all on function public.calidad_muestrear_tareas(timestamptz,uuid), public.calidad_generar_alertas(timestamptz,uuid), public.calidad_registrar_incidente_grave(uuid,uuid,text,jsonb), public.calidad_aplicar_sancion(uuid,uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.calidad_muestrear_tareas(timestamptz,uuid), public.calidad_generar_alertas(timestamptz,uuid), public.calidad_registrar_incidente_grave(uuid,uuid,text,jsonb), public.calidad_aplicar_sancion(uuid,uuid,uuid,text,text,timestamptz) to service_role;
