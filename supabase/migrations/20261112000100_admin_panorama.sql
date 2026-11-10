-- Panorama de la oficina de SAMGPLE: funciones que devuelven SOLO agregados y metadatos de la plataforma.
-- Nunca contenido de las empresas: ni títulos de tareas, ni resúmenes o fichas de traspasos, ni correos, contactos o memoria.
-- Las empresas de examen (companies.es_examen) se excluyen. Mes y semana en hora de Madrid.
-- Solo service_role las ejecuta; las páginas de /admin las llaman desde el servidor tras comprobar el rol y la MFA.

-- Céntimos de euro a partir de millonésimas de dólar (coste de IA), con el cambio que use el servidor.
create function public._usd_micros_a_centimos(p_micros numeric, p_cambio numeric)
returns bigint language sql immutable as $$
  select round(coalesce(p_micros, 0)::numeric / 10000 / greatest(p_cambio, 0.01))::bigint
$$;

-- 1) Panorama: cada indicador con su valor actual y el del mes anterior ---------------------------------------------------------
-- Indicadores de existencias (empresas, agentes, cola, alertas): valor ahora frente a valor al empezar el mes.
-- Indicadores de flujo (ventas, consumo, coste, margen, solicitudes): este mes hasta hoy frente al mes anterior completo.
create function public.admin_panorama(p_ahora timestamptz default now(), p_cambio numeric default 1.08)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_mes timestamptz := date_trunc('month', p_ahora at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  v_ant timestamptz := (date_trunc('month', p_ahora at time zone 'Europe/Madrid') - interval '1 month') at time zone 'Europe/Madrid';
  r jsonb := '{}'::jsonb;
  v_act bigint; v_prev bigint; v_a bigint; v_b bigint;
begin
  -- Empresas activas.
  select count(*) filter (where c.estado = 'activa'), count(*) filter (where c.created_at < v_mes)
    into v_act, v_prev from public.companies c where not c.es_examen;
  r := r || jsonb_build_object('empresas_activas', jsonb_build_object('actual', v_act, 'anterior', v_prev));

  -- Empresas en implantación (al empezar el mes: las que ya habían empezado y no están completadas).
  select count(*) filter (where i.estado = 'en_curso'), count(*) filter (where i.inicio < v_mes::date and i.estado <> 'completada')
    into v_act, v_prev from public.implantaciones i;
  r := r || jsonb_build_object('empresas_implantacion', jsonb_build_object('actual', v_act, 'anterior', v_prev));

  -- Agentes activos con certificación vigente.
  select count(*) into v_act from public.agents a join public.companies c on c.id = a.company_id
   where not c.es_examen and a.estado = 'activo' and a.certificado_hasta > p_ahora;
  select count(distinct ce.agent_id) into v_prev from public.certifications ce join public.companies c on c.id = ce.company_id
   where not c.es_examen and ce.certificado_en < v_mes and ce.caduca_en > v_mes and (ce.estado <> 'retirada');
  r := r || jsonb_build_object('agentes_certificados', jsonb_build_object('actual', v_act, 'anterior', v_prev));

  -- Ventas (compras pagadas, sin IVA, en céntimos).
  select coalesce(sum(p.importe_centimos) filter (where p.creado_en >= v_mes and p.creado_en <= p_ahora), 0),
         coalesce(sum(p.importe_centimos) filter (where p.creado_en >= v_ant and p.creado_en < v_mes), 0)
    into v_act, v_prev from public.purchases p where p.estado = 'pagada';
  r := r || jsonb_build_object('ventas_centimos', jsonb_build_object('actual', v_act, 'anterior', v_prev));

  -- Créditos consumidos (movimientos de consumo del libro).
  select coalesce(-sum(l.creditos) filter (where l.creado_en >= v_mes and l.creado_en <= p_ahora), 0),
         coalesce(-sum(l.creditos) filter (where l.creado_en >= v_ant and l.creado_en < v_mes), 0)
    into v_a, v_b from public.credit_ledger l join public.companies c on c.id = l.company_id
   where l.tipo = 'consumo' and not c.es_examen;
  r := r || jsonb_build_object('creditos_consumidos', jsonb_build_object('actual', v_a, 'anterior', v_b));

  -- Coste de IA del mes (céntimos de euro).
  select public._usd_micros_a_centimos(sum(t.coste_ia_usd_micros) filter (where t.creado_en >= v_mes and t.creado_en <= p_ahora), p_cambio),
         public._usd_micros_a_centimos(sum(t.coste_ia_usd_micros) filter (where t.creado_en >= v_ant and t.creado_en < v_mes), p_cambio)
    into v_act, v_prev from public.task_costs t join public.companies c on c.id = t.company_id where not c.es_examen;
  r := r || jsonb_build_object('coste_ia_centimos', jsonb_build_object('actual', v_act, 'anterior', v_prev));

  -- Margen bruto: ventas menos coste de IA.
  r := r || jsonb_build_object('margen_centimos', jsonb_build_object(
    'actual', (r -> 'ventas_centimos' ->> 'actual')::bigint - v_act,
    'anterior', (r -> 'ventas_centimos' ->> 'anterior')::bigint - v_prev));

  -- Solicitudes de acceso nuevas (recibidas en el mes).
  select count(*) filter (where s.creado_en >= v_mes and s.creado_en <= p_ahora), count(*) filter (where s.creado_en >= v_ant and s.creado_en < v_mes)
    into v_act, v_prev from public.solicitudes_acceso s;
  r := r || jsonb_build_object('solicitudes_nuevas', jsonb_build_object('actual', v_act, 'anterior', v_prev));

  -- Agentes en cola de certificación (ahora y al empezar el mes).
  select count(*) filter (where q.estado in ('pendiente_examen', 'pendiente_revision', 'en_revision', 'segunda_opinion')),
         count(*) filter (where q.enviado_en < v_mes and (q.resuelto_en is null or q.resuelto_en >= v_mes) and q.estado <> 'cancelada')
    into v_act, v_prev from public.certification_requests q join public.companies c on c.id = q.company_id where not c.es_examen;
  r := r || jsonb_build_object('cola_certificacion', jsonb_build_object('actual', v_act, 'anterior', v_prev));

  -- Alertas abiertas (avisos internos sin leer).
  select count(*) filter (where a.leida_en is null), count(*) filter (where a.creado_en < v_mes and (a.leida_en is null or a.leida_en >= v_mes))
    into v_act, v_prev from public.internal_alerts a;
  r := r || jsonb_build_object('alertas_abiertas', jsonb_build_object('actual', v_act, 'anterior', v_prev));

  return r;
end $$;

-- 2) Series para los gráficos ------------------------------------------------------------------------------------------------------
create function public.admin_series(p_ahora timestamptz default now(), p_cambio numeric default 1.08)
returns jsonb language sql stable set search_path = '' as $$
  with
  semanas as (
    select generate_series(date_trunc('week', p_ahora at time zone 'Europe/Madrid') - interval '11 weeks',
                           date_trunc('week', p_ahora at time zone 'Europe/Madrid'), interval '1 week') as inicio
  ),
  meses as (
    select generate_series(date_trunc('month', p_ahora at time zone 'Europe/Madrid') - interval '11 months',
                           date_trunc('month', p_ahora at time zone 'Europe/Madrid'), interval '1 month') as inicio
  )
  select jsonb_build_object(
    'semanas', (select jsonb_agg(jsonb_build_object(
        'inicio', to_char(s.inicio, 'YYYY-MM-DD'),
        'ventas_centimos', (select coalesce(sum(p.importe_centimos), 0) from public.purchases p
                             where p.estado = 'pagada' and (p.creado_en at time zone 'Europe/Madrid') >= s.inicio and (p.creado_en at time zone 'Europe/Madrid') < s.inicio + interval '1 week'),
        'creditos_consumidos', (select coalesce(-sum(l.creditos), 0) from public.credit_ledger l join public.companies c on c.id = l.company_id
                                 where l.tipo = 'consumo' and not c.es_examen and (l.creado_en at time zone 'Europe/Madrid') >= s.inicio and (l.creado_en at time zone 'Europe/Madrid') < s.inicio + interval '1 week')
      ) order by s.inicio) from semanas s),
    'meses', (select jsonb_agg(jsonb_build_object(
        'inicio', to_char(m.inicio, 'YYYY-MM'),
        'nuevas_empresas', (select count(*) from public.companies c
                             where not c.es_examen and (c.created_at at time zone 'Europe/Madrid') >= m.inicio and (c.created_at at time zone 'Europe/Madrid') < m.inicio + interval '1 month'),
        'ingresos_centimos', (select coalesce(sum(p.importe_centimos), 0) from public.purchases p
                               where p.estado = 'pagada' and (p.creado_en at time zone 'Europe/Madrid') >= m.inicio and (p.creado_en at time zone 'Europe/Madrid') < m.inicio + interval '1 month'),
        'coste_ia_centimos', (select public._usd_micros_a_centimos(sum(t.coste_ia_usd_micros), p_cambio) from public.task_costs t join public.companies c on c.id = t.company_id
                               where not c.es_examen and (t.creado_en at time zone 'Europe/Madrid') >= m.inicio and (t.creado_en at time zone 'Europe/Madrid') < m.inicio + interval '1 month')
      ) order by m.inicio) from meses m)
  )
$$;

-- 3) En directo: sucesos de toda la plataforma, solo metadatos ---------------------------------------------------------------------
-- Tipos: tarea_empieza, tarea_termina (con su estado), traspaso, compra, alta, certificacion. Nunca el título de la tarea ni el
-- resumen o la ficha del traspaso (son contenido de la empresa).
create function public.admin_en_directo(p_desde timestamptz default now() - interval '7 days', p_limite integer default 60)
returns table (cuando timestamptz, tipo text, empresa_id uuid, empresa text, agente text, agente_destino text, detalle jsonb)
language sql stable set search_path = '' as $$
  select * from (
    select t.started_at, 'tarea_empieza', c.id, c.name, a.name, null::text, jsonb_build_object('origen', t.origen)
      from public.tasks t join public.companies c on c.id = t.company_id left join public.agents a on a.company_id = t.company_id and a.id = t.agent_id
     where t.started_at >= p_desde and not c.es_examen and not coalesce(t.es_simulacion, false)
    union all
    select t.finished_at, 'tarea_termina', c.id, c.name, a.name, null, jsonb_build_object('estado', t.status::text)
      from public.tasks t join public.companies c on c.id = t.company_id left join public.agents a on a.company_id = t.company_id and a.id = t.agent_id
     where t.finished_at >= p_desde and not c.es_examen and not coalesce(t.es_simulacion, false)
    union all
    select h.occurred_at, 'traspaso', c.id, c.name, fa.name, ta.name, jsonb_build_object('tipo', coalesce(h.tipo_traspaso, h.kind::text))
      from public.handoffs h join public.companies c on c.id = h.company_id
      left join public.agents fa on fa.company_id = h.company_id and fa.id = h.from_agent_id
      left join public.agents ta on ta.company_id = h.company_id and ta.id = h.to_agent_id
     where h.occurred_at >= p_desde and not c.es_examen
    union all
    select p.creado_en, 'compra', c.id, c.name, null, null, jsonb_build_object('pack', p.pack_id, 'importe_centimos', p.importe_centimos, 'estado', p.estado)
      from public.purchases p join public.companies c on c.id = p.company_id
     where p.creado_en >= p_desde and not c.es_examen
    union all
    select c.created_at, 'alta', c.id, c.name, null, null, '{}'::jsonb
      from public.companies c where c.created_at >= p_desde and not c.es_examen
    union all
    select ce.certificado_en, 'certificacion', c.id, c.name, a.name, null, jsonb_build_object('version', ce.agent_version)
      from public.certifications ce join public.companies c on c.id = ce.company_id left join public.agents a on a.company_id = ce.company_id and a.id = ce.agent_id
     where ce.certificado_en >= p_desde and not c.es_examen and not ce.es_dato_de_prueba
  ) e (cuando, tipo, empresa_id, empresa, agente, agente_destino, detalle)
  where e.cuando is not null and e.cuando <= now() + interval '1 minute'
  order by e.cuando desc
  limit least(greatest(p_limite, 1), 500)
$$;

-- 4) Alertas que requieren atención, con urgencia (3 urgente, 2 atención) ---------------------------------------------------------
-- Las certificaciones atrasadas se calculan en el servidor (plazo en horas laborables): aquí se devuelve la cola con su espera.
create function public.admin_alertas(p_ahora timestamptz default now(), p_cambio numeric default 1.08)
returns table (tipo text, urgencia integer, empresa_id uuid, empresa text, agente text, desde timestamptz, detalle jsonb)
language sql stable set search_path = '' as $$
  -- Clientes sin saldo.
  select 'sin_saldo', 3, c.id, c.name, null::text, coalesce(s.ultima_actividad_en, c.created_at), '{}'::jsonb
    from public.company_credit_settings s join public.companies c on c.id = s.company_id
   where s.estado_oficina = 'sin_saldo' and not c.es_examen
  union all
  -- Recargas automáticas fallidas y errores del sistema sin leer.
  select a.tipo, 3, a.company_id, c.name, null, a.creado_en, '{}'::jsonb
    from public.internal_alerts a left join public.companies c on c.id = a.company_id
   where a.tipo in ('recarga_fallida', 'error_sistema') and a.leida_en is null
  union all
  -- Agentes suspendidos.
  select 'agente_suspendido', 2, c.id, c.name, a.name, a.actualizado_en, '{}'::jsonb
    from public.agents a join public.companies c on c.id = a.company_id
   where a.estado = 'suspendido' and not c.es_examen
  union all
  -- Errores repetidos: 3 o más tareas fallidas del mismo agente en 24 h (10 o más: urgente).
  select 'errores_repetidos', case when count(*) >= 10 then 3 else 2 end, c.id, c.name, a.name, min(t.finished_at), jsonb_build_object('fallos', count(*))
    from public.tasks t join public.companies c on c.id = t.company_id left join public.agents a on a.company_id = t.company_id and a.id = t.agent_id
   where t.status = 'failed' and t.finished_at >= p_ahora - interval '24 hours' and not c.es_examen and not coalesce(t.es_simulacion, false)
   group by c.id, c.name, a.name having count(*) >= 3
  union all
  -- Coste de IA anormal: hoy más del doble de la media diaria de los 14 días anteriores (y al menos 1 €).
  select 'coste_ia_alto', 2, c.id, c.name, null, date_trunc('day', p_ahora),
         jsonb_build_object('hoy_centimos', h.hoy, 'media_centimos', h.media)
    from (
      select t.company_id,
             public._usd_micros_a_centimos(sum(t.coste_ia_usd_micros) filter (where t.creado_en >= date_trunc('day', p_ahora)), p_cambio) as hoy,
             public._usd_micros_a_centimos(sum(t.coste_ia_usd_micros) filter (where t.creado_en >= date_trunc('day', p_ahora) - interval '14 days' and t.creado_en < date_trunc('day', p_ahora)) / 14, p_cambio) as media
        from public.task_costs t
       where t.creado_en >= date_trunc('day', p_ahora) - interval '14 days'
       group by t.company_id
    ) h join public.companies c on c.id = h.company_id
   where not c.es_examen and h.hoy >= 100 and h.hoy > 2 * greatest(h.media, 1)
  union all
  -- Cola de certificación con su espera (el servidor decide si está atrasada).
  select 'cola_certificacion', 0, c.id, c.name, a.name, coalesce(q.en_cola_desde, q.enviado_en), jsonb_build_object('via', q.via, 'estado', q.estado)
    from public.certification_requests q join public.companies c on c.id = q.company_id left join public.agents a on a.company_id = q.company_id and a.id = q.agent_id
   where q.estado in ('pendiente_revision', 'en_revision', 'segunda_opinion') and not c.es_examen
$$;

revoke all on function public._usd_micros_a_centimos(numeric, numeric), public.admin_panorama(timestamptz, numeric), public.admin_series(timestamptz, numeric),
  public.admin_en_directo(timestamptz, integer), public.admin_alertas(timestamptz, numeric) from public, anon, authenticated;
grant execute on function public._usd_micros_a_centimos(numeric, numeric), public.admin_panorama(timestamptz, numeric), public.admin_series(timestamptz, numeric),
  public.admin_en_directo(timestamptz, integer), public.admin_alertas(timestamptz, numeric) to service_role;
