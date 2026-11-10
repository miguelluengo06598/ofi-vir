-- Fase 2 · Plantillas versionadas: huella del contenido y «pendiente de certificar».
-- Las plantillas viven como código en src/lib/agentes/plantillas/ y las copia `npm run plantillas:sync`. Cada vez que cambia
-- su contenido, el script sube `version`. Una versión sin certificación vigente está «pendiente de certificar» y NO sirve
-- para crear agentes (lo impide un disparador de la base, también para el servidor). La certificación la hará IDESIE (prompt 14).

alter table public.agent_templates
  add column contenido_hash text;   -- SHA-256 del contenido que se copia (lo calcula el script; sirve para saber si cambió)

-- Las certificaciones de prueba (datos locales) quedan marcadas y no pueden confundirse con una real.
alter table public.template_certifications
  add column es_dato_de_prueba boolean not null default false;

-- ¿Tiene esa versión de la plantilla (por defecto, la actual) una certificación vigente y no caducada?
create function public.plantilla_certificada(p_template_id text, p_version integer default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.agent_templates t
      join public.template_certifications c on c.template_id = t.id and c.template_version = coalesce(p_version, t.version)
     where t.id = p_template_id and t.activa
       and c.estado = 'vigente' and c.caduca_en > now()
  );
$$;
revoke all on function public.plantilla_certificada(text, integer) from public, anon;
grant execute on function public.plantilla_certificada(text, integer) to authenticated, service_role;

-- La vista pública indica si la versión actual está certificada (la empresa solo ve un sí/no, nunca la certificación).
create or replace view public.agent_templates_public with (security_barrier = true) as
select id, nombre_por_defecto, rol, departamento_tipo, descripcion_publica, que_hace, que_no_hace,
       herramientas_disponibles, integraciones_requeridas, tipo_tarea_por_defecto, version, creado_en, actualizado_en,
       public.plantilla_certificada(id) as certificada
  from public.agent_templates
 where activa;

-- No se puede crear un agente (ni enlazar uno existente) a una plantilla cuya versión actual no esté certificada.
create function public.agents_exigir_plantilla_certificada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.template_id is not null
     and (tg_op = 'INSERT' or new.template_id is distinct from old.template_id)
     and not public.plantilla_certificada(new.template_id) then
    raise exception 'PLANTILLA_SIN_CERTIFICAR: la versión actual de la plantilla «%» está pendiente de certificar y no se puede usar para crear agentes', new.template_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger agents_exigir_plantilla_certificada before insert or update of template_id on public.agents
  for each row execute function public.agents_exigir_plantilla_certificada();
