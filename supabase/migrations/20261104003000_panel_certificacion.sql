-- Fase 2 · Panel interno de certificación (/admin/certificacion): cola de revisión, asignación, decisión con lista de comprobación,
-- segunda opinión obligatoria y certificación de plantillas. Todo es interno del equipo revisor: ninguna tabla nueva tiene políticas
-- para las empresas (RLS activada + sin permisos) y todas las funciones son solo de `service_role`.

-- 1) Roles del equipo revisor -----------------------------------------------------------------------------------------------------
alter table public.reviewers drop constraint reviewers_rol_check;
update public.reviewers set rol = case rol when 'revisor_idesie' then 'revisor_samgple' when 'admin_idesie' then 'admin_samgple' else rol end;
alter table public.reviewers add constraint reviewers_rol_check check (rol in ('revisor_samgple', 'admin_samgple'));
alter table public.reviewers add column nombre text;

-- 2) Solicitudes: asignación, segunda opinión y «pedir cambios» ------------------------------------------------------------------------
alter table public.certification_requests
  add column asignado_a uuid references public.reviewers (user_id),
  add column asignado_en timestamptz,
  add column primer_revisor uuid references public.reviewers (user_id),   -- quien hizo la revisión principal (la segunda la hace otra persona)
  add column desacuerdo boolean not null default false,                    -- las dos opiniones no coinciden: decide un admin
  add column segunda_opinion_motivos jsonb not null default '[]'::jsonb check (jsonb_typeof(segunda_opinion_motivos) = 'array'),
  add column activar_al_aprobar boolean not null default false,            -- la empresa lo marcó al enviar: al certificarse se activa solo
  add column en_cola_desde timestamptz;                                    -- cuándo entró en la cola de revisión humana
alter table public.certification_requests drop constraint certification_requests_estado_check;
alter table public.certification_requests add constraint certification_requests_estado_check
  check (estado in ('pendiente_examen', 'examen_suspendido', 'pendiente_revision', 'en_revision', 'segunda_opinion', 'aprobada', 'rechazada', 'cambios_solicitados', 'cancelada'));
create index certification_requests_asignado_idx on public.certification_requests (asignado_a) where asignado_a is not null;
update public.certification_requests set en_cola_desde = enviado_en where estado in ('pendiente_revision', 'en_revision', 'segunda_opinion') and en_cola_desde is null;

create function public.certification_requests_marcar_cola()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado = 'pendiente_revision' and new.en_cola_desde is null and (tg_op = 'INSERT' or old.estado is distinct from new.estado) then
    new.en_cola_desde := now();
  end if;
  return new;
end;
$$;
create trigger certification_requests_marcar_cola before insert or update of estado on public.certification_requests
  for each row execute function public.certification_requests_marcar_cola();

-- 3) Avisos a la empresa: se añade «cambios solicitados» (el resto, igual que antes) -----------------------------------------------------
create or replace function public.certificacion_avisar_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_examen boolean;
  v_titulo text;
  v_cuerpo text;
  v_comentario text;
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then return new; end if;
  select a.name, c.es_examen into v_nombre, v_examen
    from public.agents a join public.companies c on c.id = a.company_id where a.id = new.agent_id;
  if coalesce(v_examen, false) then return new; end if;

  v_comentario := new.comentario_empresa;
  if v_comentario is null and new.estado in ('aprobada', 'rechazada', 'cambios_solicitados') then
    select r.comentario_para_empresa into v_comentario from public.certification_reviews r
     where r.request_id = new.id and r.comentario_para_empresa is not null order by r.creado_en desc limit 1;
  end if;

  v_titulo := case new.estado
    when 'pendiente_examen' then case new.tipo
      when 'periodica' then format('%s necesita renovar su certificación', v_nombre)
      when 'cambio_modelo' then format('%s repite el examen técnico por un cambio de modelo de IA', v_nombre)
      else format('%s se ha enviado a certificación', v_nombre) end
    when 'examen_suspendido' then format('%s no ha superado el examen técnico', v_nombre)
    when 'pendiente_revision' then format('%s ha superado el examen técnico', v_nombre)
    when 'en_revision' then format('IDESIE está revisando a %s', v_nombre)
    when 'segunda_opinion' then format('La certificación de %s necesita una segunda opinión', v_nombre)
    when 'aprobada' then case when new.tipo = 'cambio_modelo' then format('%s ha superado el examen con el nuevo modelo de IA', v_nombre) else format('%s está certificado', v_nombre) end
    when 'rechazada' then format('La certificación de %s se ha rechazado', v_nombre)
    when 'cambios_solicitados' then format('Hay que hacer cambios en %s antes de certificarlo', v_nombre)
    else format('Se ha cancelado la certificación de %s', v_nombre) end;
  v_cuerpo := case new.estado
    when 'pendiente_examen' then coalesce(new.resumen_cambios, '') || case when new.tipo in ('periodica', 'cambio_modelo') then '' else ' El examen técnico empieza enseguida.' end
    when 'examen_suspendido' then 'Consulta el informe del examen para ver qué bloque ha fallado y cómo corregirlo. ' || case when new.tipo in ('nueva') then 'El agente vuelve a «en pruebas».' else 'El agente sigue trabajando con su versión certificada.' end
    when 'pendiente_revision' then 'Ahora pasa a la revisión de IDESIE' || case when new.via = 'rapida_plantilla' then ' por la vía rápida (plantilla certificada).' else '.' end
    when 'en_revision' then 'Un revisor de IDESIE está comprobando la versión enviada.'
    when 'segunda_opinion' then 'Otro revisor de IDESIE dará una segunda opinión antes de decidir.'
    when 'aprobada' then case when new.tipo = 'cambio_modelo' then 'No hace falta hacer nada.'
      else format('La versión %s queda certificada y es la que trabaja a partir de ahora.', new.agent_version)
        || case when new.activar_al_aprobar then ' Se ha activado, como pediste al enviarlo.' else ' Ya puedes activarlo.' end end
    when 'rechazada' then 'Corrige lo indicado y vuelve a enviar a certificación.'
    when 'cambios_solicitados' then 'Haz los cambios que indica el revisor y vuelve a enviarlo a certificación.'
    else 'La solicitud ya no está en curso.' end;
  if v_comentario is not null and new.estado in ('aprobada', 'rechazada', 'cambios_solicitados', 'pendiente_revision', 'en_revision', 'segunda_opinion') then
    v_cuerpo := v_cuerpo || ' Comentario del revisor: ' || v_comentario;
  end if;

  insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
  values (new.company_id, 'certificacion_estado', v_titulo, trim(v_cuerpo),
          jsonb_build_object('agent_id', new.agent_id, 'request_id', new.id, 'estado', new.estado, 'tipo', new.tipo, 'version', new.agent_version));
  return new;
end;
$$;

-- 4) Coger y soltar una solicitud ----------------------------------------------------------------------------------------------------------
-- Un revisor solo coge solicitudes de las categorías (tipo de departamento) que tiene asignadas. La segunda opinión la da OTRA persona;
-- si las dos opiniones no coinciden, solo la coge un admin, que decide.
create function public.revision_tomar(p_request_id uuid, p_revisor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.reviewers;
  v_req public.certification_requests;
  v_tipo text;
begin
  select * into v_rev from public.reviewers where user_id = p_revisor and activo;
  if not found then raise exception 'REVISOR_NO_VALIDO: no eres un revisor activo' using errcode = '42501'; end if;
  select * into v_req from public.certification_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  select d.tipo into v_tipo from public.agents a join public.departments d on d.id = a.department_id where a.id = v_req.agent_id;
  if not (coalesce(v_tipo, 'personalizado') = any (v_rev.categorias)) then
    raise exception 'CATEGORIA_NO_ASIGNADA: no tienes asignada la categoria %', coalesce(v_tipo, 'personalizado') using errcode = '42501';
  end if;
  if v_req.asignado_a is not null then
    raise exception 'YA_ASIGNADA: otra persona ya esta revisando esta solicitud' using errcode = 'P0001';
  end if;
  if v_req.estado = 'pendiente_revision' then
    update public.certification_requests set estado = 'en_revision', asignado_a = p_revisor, asignado_en = now() where id = p_request_id;
    return 'en_revision';
  elsif v_req.estado = 'segunda_opinion' then
    if v_req.primer_revisor = p_revisor or exists (select 1 from public.certification_reviews r where r.request_id = p_request_id and r.revisor_id = p_revisor) then
      raise exception 'MISMO_REVISOR: la segunda opinion la tiene que dar otra persona' using errcode = 'P0001';
    end if;
    if v_req.desacuerdo and v_rev.rol <> 'admin_samgple' then
      raise exception 'SOLO_ADMIN: las dos opiniones no coinciden y decide un administrador' using errcode = '42501';
    end if;
    update public.certification_requests set asignado_a = p_revisor, asignado_en = now() where id = p_request_id;
    return 'segunda_opinion';
  end if;
  raise exception 'NO_DISPONIBLE: la solicitud no esta en la cola de revision (%)', v_req.estado using errcode = 'P0001';
end;
$$;

create function public.revision_soltar(p_request_id uuid, p_revisor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.certification_requests;
begin
  select * into v_req from public.certification_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if v_req.asignado_a is distinct from p_revisor or v_req.estado not in ('en_revision', 'segunda_opinion') then
    raise exception 'NO_ASIGNADA: esta solicitud no la tienes asignada' using errcode = '42501';
  end if;
  update public.certification_requests
     set asignado_a = null, asignado_en = null, estado = case when estado = 'en_revision' then 'pendiente_revision' else estado end
   where id = p_request_id;
  return case when v_req.estado = 'en_revision' then 'pendiente_revision' else v_req.estado end;
end;
$$;

-- 5) Decidir -----------------------------------------------------------------------------------------------------------------------------
-- p_checklist: los 9 puntos [{id, ok, comentario?}]. Aprobar exige los 9 cumplidos. Comentario para la empresa obligatorio si no se aprueba.
-- p_requiere_segunda / p_motivos: lo calcula el servidor a partir de la versión enviada (escribe en el CRM, envía mensajes externos sin
-- aprobación o puede gastar dinero). Un rechazo siempre necesita segunda opinión.
-- Devuelve el estado en que queda la solicitud.
create function public.revision_decidir(
  p_request_id uuid, p_revisor uuid, p_decision text, p_checklist jsonb, p_comentario text, p_notas text,
  p_requiere_segunda boolean default false, p_motivos jsonb default '[]'::jsonb
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.reviewers;
  v_req public.certification_requests;
  v_comentario text := nullif(trim(left(coalesce(p_comentario, ''), 2000)), '');
  v_primera public.certification_reviews;
  v_cerrar boolean := false;
  v_estado text;
begin
  select * into v_rev from public.reviewers where user_id = p_revisor and activo;
  if not found then raise exception 'REVISOR_NO_VALIDO: no eres un revisor activo' using errcode = '42501'; end if;
  select * into v_req from public.certification_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if v_req.asignado_a is distinct from p_revisor or v_req.estado not in ('en_revision', 'segunda_opinion') then
    raise exception 'NO_ASIGNADA: coge la solicitud antes de decidir' using errcode = '42501';
  end if;
  if p_decision not in ('aprobar', 'pedir_cambios', 'rechazar') then raise exception 'DECISION_INVALIDA: decision no valida' using errcode = '22023'; end if;
  if p_decision <> 'aprobar' and v_comentario is null then
    raise exception 'COMENTARIO_OBLIGATORIO: explica a la empresa que tiene que cambiar' using errcode = '22023';
  end if;
  if jsonb_typeof(p_checklist) is distinct from 'array' or jsonb_array_length(p_checklist) <> 9 then
    raise exception 'CHECKLIST_INVALIDA: la lista de comprobacion tiene 9 puntos' using errcode = '22023';
  end if;
  if p_decision = 'aprobar' and exists (select 1 from jsonb_array_elements(p_checklist) e where coalesce((e ->> 'ok')::boolean, false) is not true) then
    raise exception 'CHECKLIST_INCOMPLETA: no se puede aprobar con puntos de la lista sin cumplir' using errcode = '22023';
  end if;

  insert into public.certification_reviews (request_id, revisor_id, rol, checklist, decision, comentario_para_empresa, notas_internas)
  values (p_request_id, p_revisor, case when v_req.estado = 'en_revision' then 'principal' else 'segunda_opinion' end,
          p_checklist, p_decision, v_comentario, nullif(trim(left(coalesce(p_notas, ''), 4000)), ''));

  if v_req.estado = 'en_revision' then
    if p_decision = 'pedir_cambios' or (p_decision = 'aprobar' and not coalesce(p_requiere_segunda, false)) then
      v_cerrar := true;
    else
      update public.certification_requests
         set estado = 'segunda_opinion', primer_revisor = p_revisor, asignado_a = null, asignado_en = null,
             segunda_opinion_motivos = case when p_decision = 'rechazar' then '["Es un rechazo."]'::jsonb else '[]'::jsonb end || coalesce(p_motivos, '[]'::jsonb)
       where id = p_request_id;
      return 'segunda_opinion';
    end if;
  else
    select * into v_primera from public.certification_reviews r where r.request_id = p_request_id and r.rol = 'principal' order by r.creado_en desc limit 1;
    if v_req.desacuerdo or p_decision = v_primera.decision then
      v_cerrar := true;   -- coinciden, o decide el admin tras un desacuerdo
      v_comentario := coalesce(v_comentario, v_primera.comentario_para_empresa);
    else
      update public.certification_requests set desacuerdo = true, asignado_a = null, asignado_en = null where id = p_request_id;
      return 'segunda_opinion';
    end if;
  end if;

  if p_decision = 'aprobar' then
    v_estado := public.certificacion_resolver(v_req.company_id, p_request_id, 'aprobar', v_comentario);
    if v_req.activar_al_aprobar and exists (select 1 from public.agents where id = v_req.agent_id and estado = 'certificado') then
      perform public.agente_cambiar_estado(v_req.company_id, v_req.agent_id, 'activar');
    end if;
  elsif p_decision = 'rechazar' then
    v_estado := public.certificacion_resolver(v_req.company_id, p_request_id, 'rechazar', v_comentario);
  else
    v_estado := 'cambios_solicitados';
    update public.agents set estado = 'en_pruebas' where company_id = v_req.company_id and id = v_req.agent_id and estado = 'en_certificacion';
    update public.certification_requests set estado = v_estado, resuelto_en = now(), comentario_empresa = v_comentario where id = p_request_id;
  end if;
  return v_estado;
end;
$$;

-- 6) Plantillas: misma cola y mismo proceso para certificar una versión antes de publicarla ------------------------------------------------
-- Una versión de plantilla sin certificación vigente no sirve para crear agentes (ya lo impedía la base). Aquí se revisa y se certifica.
-- Una plantilla la usarán muchas empresas: SIEMPRE necesita segunda opinión.
create table public.template_review_requests (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references public.agent_templates (id),
  template_version integer not null check (template_version >= 1),
  tipo text not null default 'nueva_version' check (tipo in ('nueva_version', 'periodica')),
  estado text not null default 'pendiente_revision'
    check (estado in ('pendiente_revision', 'en_revision', 'segunda_opinion', 'aprobada', 'rechazada', 'cambios_solicitados', 'cancelada')),
  enviado_en timestamptz not null default now(),
  asignado_a uuid references public.reviewers (user_id),
  asignado_en timestamptz,
  primer_revisor uuid references public.reviewers (user_id),
  desacuerdo boolean not null default false,
  comentario text,
  resuelto_en timestamptz
);
create unique index template_review_requests_una_abierta_idx on public.template_review_requests (template_id, template_version)
  where estado in ('pendiente_revision', 'en_revision', 'segunda_opinion');

create table public.template_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.template_review_requests (id),
  revisor_id uuid not null references public.reviewers (user_id),
  rol text not null check (rol in ('principal', 'segunda_opinion')),
  checklist jsonb not null default '[]'::jsonb,
  decision text not null check (decision in ('aprobar', 'rechazar', 'pedir_cambios')),
  comentario text,
  notas_internas text,
  creado_en timestamptz not null default now()
);
create index template_reviews_request_idx on public.template_reviews (request_id);

alter table public.template_review_requests enable row level security;
alter table public.template_reviews enable row level security;
revoke all on public.template_review_requests, public.template_reviews from anon, authenticated;
grant select, insert, update, delete on public.template_review_requests, public.template_reviews to service_role;

-- Cada versión nueva de una plantilla (sin certificar) entra sola en la cola.
create function public.agent_templates_pedir_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.plantilla_certificada(new.id, new.version) then
    update public.template_review_requests set estado = 'cancelada', resuelto_en = now()
     where template_id = new.id and template_version < new.version and estado in ('pendiente_revision', 'en_revision', 'segunda_opinion');
    insert into public.template_review_requests (template_id, template_version)
    select new.id, new.version
     where not exists (select 1 from public.template_review_requests r where r.template_id = new.id and r.template_version = new.version
                         and r.estado in ('pendiente_revision', 'en_revision', 'segunda_opinion'));
  end if;
  return new;
end;
$$;
create trigger agent_templates_pedir_revision after insert or update of version on public.agent_templates
  for each row execute function public.agent_templates_pedir_revision();
insert into public.template_review_requests (template_id, template_version)
select t.id, t.version from public.agent_templates t where t.activa and not public.plantilla_certificada(t.id, t.version);

create function public.plantilla_revision_tomar(p_request_id uuid, p_revisor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.reviewers;
  v_req public.template_review_requests;
  v_tipo text;
begin
  select * into v_rev from public.reviewers where user_id = p_revisor and activo;
  if not found then raise exception 'REVISOR_NO_VALIDO: no eres un revisor activo' using errcode = '42501'; end if;
  select * into v_req from public.template_review_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  select departamento_tipo into v_tipo from public.agent_templates where id = v_req.template_id;
  if not (v_tipo = any (v_rev.categorias)) then
    raise exception 'CATEGORIA_NO_ASIGNADA: no tienes asignada la categoria %', v_tipo using errcode = '42501';
  end if;
  if v_req.asignado_a is not null then raise exception 'YA_ASIGNADA: otra persona ya esta revisando esta solicitud' using errcode = 'P0001'; end if;
  if v_req.estado = 'pendiente_revision' then
    update public.template_review_requests set estado = 'en_revision', asignado_a = p_revisor, asignado_en = now() where id = p_request_id;
    return 'en_revision';
  elsif v_req.estado = 'segunda_opinion' then
    if v_req.primer_revisor = p_revisor or exists (select 1 from public.template_reviews r where r.request_id = p_request_id and r.revisor_id = p_revisor) then
      raise exception 'MISMO_REVISOR: la segunda opinion la tiene que dar otra persona' using errcode = 'P0001';
    end if;
    if v_req.desacuerdo and v_rev.rol <> 'admin_samgple' then
      raise exception 'SOLO_ADMIN: las dos opiniones no coinciden y decide un administrador' using errcode = '42501';
    end if;
    update public.template_review_requests set asignado_a = p_revisor, asignado_en = now() where id = p_request_id;
    return 'segunda_opinion';
  end if;
  raise exception 'NO_DISPONIBLE: la solicitud no esta en la cola de revision (%)', v_req.estado using errcode = 'P0001';
end;
$$;

create function public.plantilla_revision_decidir(p_request_id uuid, p_revisor uuid, p_decision text, p_checklist jsonb, p_comentario text, p_notas text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.template_review_requests;
  v_comentario text := nullif(trim(left(coalesce(p_comentario, ''), 2000)), '');
  v_primera public.template_reviews;
  v_estado text;
begin
  if not exists (select 1 from public.reviewers where user_id = p_revisor and activo) then
    raise exception 'REVISOR_NO_VALIDO: no eres un revisor activo' using errcode = '42501';
  end if;
  select * into v_req from public.template_review_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if v_req.asignado_a is distinct from p_revisor or v_req.estado not in ('en_revision', 'segunda_opinion') then
    raise exception 'NO_ASIGNADA: coge la solicitud antes de decidir' using errcode = '42501';
  end if;
  if p_decision not in ('aprobar', 'pedir_cambios', 'rechazar') then raise exception 'DECISION_INVALIDA: decision no valida' using errcode = '22023'; end if;
  if p_decision <> 'aprobar' and v_comentario is null then
    raise exception 'COMENTARIO_OBLIGATORIO: explica que hay que cambiar' using errcode = '22023';
  end if;
  if jsonb_typeof(p_checklist) is distinct from 'array' or jsonb_array_length(p_checklist) <> 9 then
    raise exception 'CHECKLIST_INVALIDA: la lista de comprobacion tiene 9 puntos' using errcode = '22023';
  end if;
  if p_decision = 'aprobar' and exists (select 1 from jsonb_array_elements(p_checklist) e where coalesce((e ->> 'ok')::boolean, false) is not true) then
    raise exception 'CHECKLIST_INCOMPLETA: no se puede aprobar con puntos de la lista sin cumplir' using errcode = '22023';
  end if;

  insert into public.template_reviews (request_id, revisor_id, rol, checklist, decision, comentario, notas_internas)
  values (p_request_id, p_revisor, case when v_req.estado = 'en_revision' then 'principal' else 'segunda_opinion' end,
          p_checklist, p_decision, v_comentario, nullif(trim(left(coalesce(p_notas, ''), 4000)), ''));

  if v_req.estado = 'en_revision' and p_decision <> 'pedir_cambios' then
    update public.template_review_requests set estado = 'segunda_opinion', primer_revisor = p_revisor, asignado_a = null, asignado_en = null where id = p_request_id;
    return 'segunda_opinion';
  elsif v_req.estado = 'segunda_opinion' then
    select * into v_primera from public.template_reviews r where r.request_id = p_request_id and r.rol = 'principal' order by r.creado_en desc limit 1;
    if not (v_req.desacuerdo or p_decision = v_primera.decision) then
      update public.template_review_requests set desacuerdo = true, asignado_a = null, asignado_en = null where id = p_request_id;
      return 'segunda_opinion';
    end if;
    v_comentario := coalesce(v_comentario, v_primera.comentario);
  end if;

  v_estado := case p_decision when 'aprobar' then 'aprobada' when 'rechazar' then 'rechazada' else 'cambios_solicitados' end;
  if p_decision = 'aprobar' then
    update public.template_certifications set estado = 'caducada'
     where template_id = v_req.template_id and template_version = v_req.template_version and estado = 'vigente';
    insert into public.template_certifications (template_id, template_version, certificado_por, caduca_en)
    values (v_req.template_id, v_req.template_version, p_revisor, now() + interval '6 months');
  end if;
  update public.template_review_requests set estado = v_estado, resuelto_en = now(), comentario = v_comentario where id = p_request_id;
  return v_estado;
end;
$$;

-- 7) Permisos ----------------------------------------------------------------------------------------------------------------------------
revoke all on function
  public.certification_requests_marcar_cola(), public.agent_templates_pedir_revision(),
  public.revision_tomar(uuid, uuid), public.revision_soltar(uuid, uuid),
  public.revision_decidir(uuid, uuid, text, jsonb, text, text, boolean, jsonb),
  public.plantilla_revision_tomar(uuid, uuid), public.plantilla_revision_decidir(uuid, uuid, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function
  public.revision_tomar(uuid, uuid), public.revision_soltar(uuid, uuid),
  public.revision_decidir(uuid, uuid, text, jsonb, text, text, boolean, jsonb),
  public.plantilla_revision_tomar(uuid, uuid), public.plantilla_revision_decidir(uuid, uuid, text, jsonb, text, text)
  to service_role;
