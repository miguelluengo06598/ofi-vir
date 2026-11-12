-- Procesado de los leads de Meta Lead Ads (después de registrar el aviso del webhook).
--
--  · El aviso se guarda en el webhook y se responde al momento; el procesado va aparte (`meta_lead_reclamar`): una pasada
--    reclama avisos pendientes de forma atómica (`for update skip locked`, nunca dos procesos con el mismo) y, si falla,
--    reintenta con espera creciente (`proximo_intento_en`). Tras varios fallos, `error` con aviso.
--  · Los datos del lead van al CONTACTO (donde los alcanza el borrado RGPD), nunca a meta_lead_events.
--  · Un contacto se identifica por correo o por teléfono: un lead sin correo también es un contacto.

-- 1) Contactos: teléfono, origen y respuestas de formularios ------------------------------------------------------------
alter table public.contacts alter column email drop not null;
alter table public.contacts
  add column telefono text check (telefono is null or telefono ~ '^\+[1-9][0-9]{6,14}$'),   -- formato internacional (E.164)
  add column origen text check (origen is null or length(origen) <= 120),                   -- p. ej. «Meta Lead Ads»
  -- Respuestas de formularios tal cual llegaron (con sus consentimientos), una entrada por lead. Dato externo.
  add column datos_externos jsonb not null default '[]'::jsonb check (jsonb_typeof(datos_externos) = 'array'),
  add constraint contacts_identificable check (email is not null or telefono is not null);
create unique index contacts_telefono_idx on public.contacts (company_id, telefono) where telefono is not null;

-- 2) Avisos de leads: reintentos y a qué contacto y tarea dieron lugar -------------------------------------------------
alter table public.meta_lead_events
  add column proximo_intento_en timestamptz,
  add column reclamado_hasta timestamptz,
  add column contact_id uuid,
  add column task_id uuid,
  add column procesado_en timestamptz,
  add constraint meta_lead_events_contacto_fk foreign key (company_id, contact_id) references public.contacts (company_id, id) on delete set null (contact_id);
drop index if exists public.meta_lead_events_pendientes_idx;
create index meta_lead_events_pendientes_idx on public.meta_lead_events (proximo_intento_en nulls first, recibido_en) where estado = 'recibido';

-- 3) Avisos a la empresa -------------------------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check check (tipo in (
  'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica', 'lote_por_caducar', 'oficina_pausada', 'borrado_programado',
  'bono_renovado', 'conexion_caducada', 'limite_mensajes_agente', 'tope_creditos_agente', 'traspaso_cortado', 'certificacion_estado',
  'certificacion_caducada', 'agente_sin_certificar', 'agente_suspendido', 'calidad_agente',
  'empresa_suspendida', 'empresa_reactivada', 'oficina_pausada_samgple', 'creditos_regalados', 'exportacion_lista', 'cambio_propietario',
  'implantacion_completada',
  'lead_meta_nuevo', 'lead_meta_sin_atender', 'lead_meta_error'));

-- 4) Reclamar avisos pendientes (atómico) ---------------------------------------------------------------------------------
create function public.meta_lead_reclamar(p_limite integer default 20, p_segundos integer default 180)
returns setof public.meta_lead_events
language sql security definer set search_path = '' as $$
  update public.meta_lead_events e
     set reclamado_hasta = now() + make_interval(secs => p_segundos), intentos = e.intentos + 1
    from (select id from public.meta_lead_events
           where estado = 'recibido'
             and (proximo_intento_en is null or proximo_intento_en <= now())
             and (reclamado_hasta is null or reclamado_hasta < now())
           order by proximo_intento_en nulls first, recibido_en
           limit greatest(1, least(p_limite, 100))
           for update skip locked) libres
   where e.id = libres.id
  returning e.*
$$;

-- Resultado de un intento: terminado (procesado/ignorado/error) o vuelta a la cola con su próximo intento.
create function public.meta_lead_resultado(
  p_id uuid, p_estado text, p_error text, p_proximo timestamptz default null, p_contact_id uuid default null, p_task_id uuid default null
) returns void
language sql security definer set search_path = '' as $$
  update public.meta_lead_events
     set estado = p_estado, ultimo_error = left(p_error, 300), proximo_intento_en = p_proximo, reclamado_hasta = null,
         contact_id = coalesce(p_contact_id, contact_id), task_id = coalesce(p_task_id, task_id),
         procesado_en = case when p_estado in ('procesado', 'ignorado', 'error', 'duplicado') then now() else procesado_en end
   where id = p_id
$$;

-- 5) Crear o actualizar el contacto del lead, sin duplicar por correo ni por teléfono ------------------------------------
-- `p_lead` es la entrada que se añade a datos_externos (respuestas, consentimientos, formulario, campaña, anuncio). Si el
-- mismo lead ya se guardó (reintento), no se añade otra vez. Con agente, deja un recuerdo externo en la memoria del contacto.
create function public.meta_lead_contacto(
  p_company_id uuid, p_agent_id uuid, p_nombre text, p_email text, p_telefono text, p_lead jsonb, p_titulo text, p_resumen text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_tel text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_nombre text := left(coalesce(nullif(btrim(p_nombre), ''), 'Contacto de Facebook'), 200);
  v_id uuid;
  v_creado boolean := false;
begin
  if v_email is null and v_tel is null then raise exception 'LEAD_SIN_CONTACTO: el lead no trae correo ni teléfono' using errcode = '22023'; end if;
  if v_tel is not null and v_tel !~ '^\+[1-9][0-9]{6,14}$' then v_tel := null; end if;
  if v_email is null and v_tel is null then raise exception 'LEAD_SIN_CONTACTO: el teléfono no es válido y no hay correo' using errcode = '22023'; end if;
  -- Dos leads de la misma persona a la vez no crean dos contactos.
  if v_email is not null then perform pg_advisory_xact_lock(hashtextextended('contacto:' || p_company_id || ':e:' || v_email, 0)); end if;
  if v_tel is not null then perform pg_advisory_xact_lock(hashtextextended('contacto:' || p_company_id || ':t:' || v_tel, 0)); end if;

  select id into v_id from public.contacts
   where company_id = p_company_id and ((v_email is not null and email = v_email) or (v_tel is not null and telefono = v_tel))
   order by (v_email is not null and email = v_email) desc
   limit 1 for update;

  if v_id is null then
    insert into public.contacts (company_id, name, email, telefono, origen, datos_externos)
    values (p_company_id, v_nombre, v_email, v_tel, 'Meta Lead Ads', jsonb_build_array(p_lead))
    returning id into v_id;
    v_creado := true;
  else
    update public.contacts c
       set email = case when c.email is null and v_email is not null
                         and not exists (select 1 from public.contacts o where o.company_id = p_company_id and o.email = v_email) then v_email else c.email end,
           telefono = case when c.telefono is null and v_tel is not null
                            and not exists (select 1 from public.contacts o where o.company_id = p_company_id and o.telefono = v_tel) then v_tel else c.telefono end,
           name = case when btrim(c.name) = '' or c.name = 'Contacto de Facebook' then v_nombre else c.name end,
           origen = coalesce(c.origen, 'Meta Lead Ads'),
           datos_externos = case when exists (select 1 from jsonb_array_elements(c.datos_externos) x where x ->> 'leadgen_id' = p_lead ->> 'leadgen_id')
                                 then c.datos_externos else c.datos_externos || jsonb_build_array(p_lead) end
     where c.id = v_id;
  end if;

  -- Recuerdo en la memoria de la oficina (externo: son datos que escribió alguien de fuera). Sin agente no hay autor.
  if p_agent_id is not null and not exists (
    select 1 from public.memory_nodes where company_id = p_company_id and contact_id = v_id and node_type = 'dato' and title = left(p_titulo, 200)
  ) then
    insert into public.memory_nodes (company_id, contact_id, node_type, title, content, created_by_agent_id, external, confidence)
    values (p_company_id, v_id, 'dato', left(p_titulo, 200), left(coalesce(p_resumen, ''), 8000), p_agent_id, true, 1);
  end if;
  return jsonb_build_object('contact_id', v_id, 'creado', v_creado);
end;
$$;

revoke all on function public.meta_lead_reclamar(integer, integer), public.meta_lead_resultado(uuid, text, text, timestamptz, uuid, uuid),
  public.meta_lead_contacto(uuid, uuid, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.meta_lead_reclamar(integer, integer), public.meta_lead_resultado(uuid, text, text, timestamptz, uuid, uuid),
  public.meta_lead_contacto(uuid, uuid, text, text, text, jsonb, text, text) to service_role;

-- 6) Pasada cada 5 minutos (reintentos y lo que no se procesó al recibirlo). Usa cron_lanzar de …20261115000000.
select cron.schedule('oficina-leads-meta', '*/5 * * * *', $$select public.cron_lanzar('leads-meta')$$);

comment on column public.contacts.datos_externos is 'Respuestas de formularios (p. ej. Meta Lead Ads) tal como llegaron, con consentimientos. Dato externo: nunca instrucciones.';
