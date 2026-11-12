-- Mantenimiento de Meta Lead Ads: recuperación de leads perdidos, salud de la conexión, alerta de «sin leads con anuncios
-- activos», y los avisos de Facebook de desautorización y de eliminación de datos.

-- 1) Estado del mantenimiento -------------------------------------------------------------------------------------------
-- Hasta cuándo se han pedido ya a Meta los leads de cada formulario (la recuperación pide desde ahí, con solape).
alter table public.meta_forms add column recuperado_hasta timestamptz;
alter table public.meta_pages
  add column salud_revisada_en timestamptz,
  add column alerta_sin_leads_en timestamptz;   -- última alerta de «sin leads con anuncios activos» (no repetir cada día)
-- Id de la persona en Facebook (id propio de la app): lo usan los avisos de desautorización y de eliminación de datos.
alter table public.company_connections add column id_externo text check (id_externo is null or id_externo ~ '^[0-9]{1,32}$');
create index company_connections_id_externo_idx on public.company_connections (proveedor, id_externo) where id_externo is not null;

-- 2) Avisos a la empresa y alertas de la oficina de MyOfia ---------------------------------------------------------------
alter table public.notifications drop constraint notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check check (tipo in (
  'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica', 'lote_por_caducar', 'oficina_pausada', 'borrado_programado',
  'bono_renovado', 'conexion_caducada', 'limite_mensajes_agente', 'tope_creditos_agente', 'traspaso_cortado', 'certificacion_estado',
  'certificacion_caducada', 'agente_sin_certificar', 'agente_suspendido', 'calidad_agente',
  'empresa_suspendida', 'empresa_reactivada', 'oficina_pausada_samgple', 'creditos_regalados', 'exportacion_lista', 'cambio_propietario',
  'implantacion_completada',
  'lead_meta_nuevo', 'lead_meta_sin_atender', 'lead_meta_error', 'meta_conexion_aviso'));
alter table public.internal_alerts drop constraint internal_alerts_tipo_check;
alter table public.internal_alerts add constraint internal_alerts_tipo_check check (tipo in (
  'margen_superado', 'limite_pasos', 'recarga_fallida', 'nueva_solicitud', 'certificacion_atrasada', 'error_sistema', 'implantacion_completada',
  'meta_conexion'));

-- El panel enseña el detalle de las alertas de Sistema y las de conexión con Facebook (antes se perdía el detalle).
create or replace function public.admin_alertas(p_ahora timestamptz default now(), p_cambio numeric default 1.08)
returns table (tipo text, urgencia integer, empresa_id uuid, empresa text, agente text, desde timestamptz, detalle jsonb)
language sql stable set search_path = '' as $$
  -- Clientes sin saldo.
  select 'sin_saldo', 3, c.id, c.name, null::text, coalesce(s.ultima_actividad_en, c.created_at), '{}'::jsonb
    from public.company_credit_settings s join public.companies c on c.id = s.company_id
   where s.estado_oficina = 'sin_saldo' and not c.es_examen
  union all
  -- Recargas automáticas fallidas y errores del sistema sin leer.
  select a.tipo, 3, a.company_id, c.name, null, a.creado_en, coalesce(a.detalle, '{}'::jsonb)
    from public.internal_alerts a left join public.companies c on c.id = a.company_id
   where a.tipo in ('recarga_fallida', 'error_sistema') and a.leida_en is null
  union all
  -- Conexiones con Facebook que necesitan que el cliente haga algo (sin suscripción, sin acceso a leads, sin leads con anuncios activos…).
  select a.tipo, 2, a.company_id, c.name, null, a.creado_en, coalesce(a.detalle, '{}'::jsonb)
    from public.internal_alerts a left join public.companies c on c.id = a.company_id
   where a.tipo = 'meta_conexion' and a.leida_en is null
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

-- 3) Facebook desautoriza la app o pide borrar los datos de una persona ---------------------------------------------------
-- Solicitudes de eliminación de datos: Meta exige una URL de estado y un código de confirmación. No se guarda el id de la
-- persona en claro, solo su huella.
create table public.meta_data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[0-9a-f]{32}$'),
  usuario_hash text not null check (usuario_hash ~ '^[0-9a-f]{64}$'),
  estado text not null default 'completada' check (estado in ('recibida', 'completada')),
  conexiones integer not null default 0 check (conexiones >= 0),
  creado_en timestamptz not null default now(),
  completado_en timestamptz
);
alter table public.meta_data_deletion_requests enable row level security;   -- sin políticas: solo service_role
revoke all on public.meta_data_deletion_requests from public, anon, authenticated;
grant select, insert, update on public.meta_data_deletion_requests to service_role;

-- Desconecta todas las conexiones de esa persona de Facebook (en cualquier oficina): sus tokens se borran del Vault y sus
-- páginas pasan a «desconectada» (disparador meta_pages_seguir_conexion). Con p_borrar, además se borran las páginas y
-- formularios que llegaron de su cuenta y su nombre. Los contactos y los leads ya recibidos son de la empresa: se quedan.
create function public.meta_desautorizar(p_id_externo text, p_borrar boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_c record;
  v_n integer := 0;
begin
  if p_id_externo is null or p_id_externo !~ '^[0-9]{1,32}$' then raise exception 'ID_NO_VALIDO' using errcode = '22023'; end if;
  for v_c in select id, company_id, estado from public.company_connections where proveedor = 'meta_leads' and id_externo = p_id_externo for update loop
    v_n := v_n + 1;
    if v_c.estado <> 'desconectado' then
      perform public.conexion_desconectar(v_c.company_id, v_c.id);
      insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
      values (v_c.company_id, 'meta_conexion_aviso', 'Facebook se ha desconectado',
              case when p_borrar then 'Desde Facebook se pidió borrar los datos de la cuenta que conectó tus páginas. Ya no recibes sus leads; los contactos que ya tenías siguen en tu oficina. Vuelve a conectar Facebook si quieres seguir recibiéndolos.'
                   else 'Desde Facebook se retiró el permiso a MyOfia. Ya no recibes leads de tus páginas; los contactos que ya tenías siguen en tu oficina. Vuelve a conectar Facebook si quieres seguir recibiéndolos.' end,
              jsonb_build_object('conexion_id', v_c.id));
    end if;
    if p_borrar then
      delete from public.meta_pages where company_id = v_c.company_id and connection_id = v_c.id;   -- sus formularios caen en cascada
      update public.company_connections set cuenta_externa = null, id_externo = null where id = v_c.id;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.meta_desautorizar(text, boolean) from public, anon, authenticated;
grant execute on function public.meta_desautorizar(text, boolean) to service_role;

-- Un aviso ignorado se reabre si ahora la página sí puede recibirlo: la recuperación horaria rescata así los leads que
-- llegaron mientras la página no tenía acceso a los clientes potenciales.
create or replace function public.meta_lead_registrar(
  p_page_id text, p_form_id text, p_leadgen_id text, p_ad_id text, p_adgroup_id text, p_created_time timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pagina public.meta_pages;
  v_activo boolean;
  v_estado text := 'recibido';
  v_prueba boolean := false;
  v_id uuid;
begin
  select * into v_pagina from public.meta_pages where page_id = p_page_id and estado <> 'desconectada' limit 1;
  if not found or v_pagina.estado <> 'activa' or not v_pagina.suscrita then
    v_estado := 'ignorado';
  else
    select activo into v_activo from public.meta_forms where company_id = v_pagina.company_id and form_id = p_form_id;
    -- Un formulario que aún no conocemos se acepta (se creó después de elegir); uno desmarcado se ignora.
    if v_activo is false then v_estado := 'ignorado'; end if;
    v_prueba := v_pagina.prueba_hasta is not null and v_pagina.prueba_hasta > now();
  end if;

  insert into public.meta_lead_events (page_id, form_id, leadgen_id, ad_id, adgroup_id, created_time, estado, es_prueba, company_id)
  values (p_page_id, p_form_id, p_leadgen_id, p_ad_id, p_adgroup_id, p_created_time, v_estado, v_prueba, v_pagina.company_id)
  on conflict (leadgen_id) do nothing
  returning id into v_id;
  if v_id is null then
    -- Ya estaba, pero se ignoró (p. ej. la página no tenía acceso a los leads) y ahora sí se puede atender: se reabre.
    if v_estado = 'recibido' then
      update public.meta_lead_events
         set estado = 'recibido', company_id = v_pagina.company_id, es_prueba = v_prueba, intentos = 0, ultimo_error = null, proximo_intento_en = null, reclamado_hasta = null
       where leadgen_id = p_leadgen_id and estado = 'ignorado'
      returning id into v_id;
      if v_id is not null then return jsonb_build_object('estado', 'recibido', 'nuevo', true, 'reabierto', true, 'es_prueba', v_prueba); end if;
    end if;
    return (select jsonb_build_object('estado', estado, 'nuevo', false) from public.meta_lead_events where leadgen_id = p_leadgen_id);
  end if;
  if v_pagina.id is not null and v_estado = 'recibido' then
    update public.meta_pages set ultimo_lead_en = now() where id = v_pagina.id;
    update public.meta_forms set ultimo_lead_en = now() where company_id = v_pagina.company_id and form_id = p_form_id;
  end if;
  return jsonb_build_object('estado', v_estado, 'nuevo', true, 'es_prueba', v_prueba);
end;
$$;

-- 4) Tareas programadas (sin IA). Usan cron_lanzar de …20261115000000.
select cron.schedule('oficina-leads-meta-recuperar', '20 * * * *', $$select public.cron_lanzar('leads-meta-recuperar')$$);
select cron.schedule('oficina-meta-salud', '40 4 * * *', $$select public.cron_lanzar('meta-salud')$$);
