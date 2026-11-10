-- Fase 2 · Panel interno de márgenes (/admin/margenes). Solo lo lee el equipo de IDESIE, siempre con la clave de servicio.
-- Solo agregados económicos: nada de correos, contactos ni memoria de las empresas.

-- 1) Tipo de tarea en el coste interno (para comparar coste real y precio por tipo) ---------------------------------
alter table public.task_costs
  add column tipo_tarea text check (tipo_tarea is null or tipo_tarea in ('simple', 'estandar', 'experta'));
create index task_costs_agente_idx on public.task_costs (company_id, agent_id, creado_en desc);

-- 2) Alertas internas ------------------------------------------------------------------------------------------------
-- No llevan datos personales: solo ids y cifras técnicas. Sin política para `authenticated`: ninguna empresa las ve.
create table public.internal_alerts (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('margen_superado', 'limite_pasos', 'recarga_fallida')),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid,
  task_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
create index internal_alerts_fecha_idx on public.internal_alerts (creado_en desc);
create index internal_alerts_agente_idx on public.internal_alerts (company_id, agent_id, tipo, creado_en desc);
alter table public.internal_alerts enable row level security;
revoke all on public.internal_alerts from anon, authenticated;
grant select, insert, update, delete on public.internal_alerts to service_role;

-- 3) Agregados del panel ----------------------------------------------------------------------------------------------
-- p_mes: primer día del mes que se consulta (hora de Madrid). Dinero en céntimos; el coste de IA en millonésimas de dólar
-- (la conversión a euros la hace el servidor con CAMBIO_USD_POR_EUR). «Cobrado» = compras en estado 'pagada', sin IVA.
create function public.admin_margenes(p_mes date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with lim as (
    select (date_trunc('month', p_mes)::timestamp at time zone 'Europe/Madrid') as ini,
           ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone 'Europe/Madrid') as fin,
           ((date_trunc('month', p_mes) - interval '5 months')::timestamp at time zone 'Europe/Madrid') as ini6
  ), eventos as (
    select company_id, to_char(creado_en at time zone 'Europe/Madrid', 'YYYY-MM') as mes,
           importe_centimos::bigint as cobrado, 0::bigint as consumidos, 0::bigint as coste
      from public.purchases, lim where estado = 'pagada' and creado_en >= lim.ini6 and creado_en < lim.fin
    union all
    select company_id, to_char(creado_en at time zone 'Europe/Madrid', 'YYYY-MM'), 0, -creditos, 0
      from public.credit_ledger, lim where tipo = 'consumo' and creado_en >= lim.ini6 and creado_en < lim.fin
    union all
    select company_id, to_char(creado_en at time zone 'Europe/Madrid', 'YYYY-MM'), 0, 0, coste_ia_usd_micros
      from public.task_costs, lim where creado_en >= lim.ini6 and creado_en < lim.fin
  ), por_empresa_mes as (
    select e.company_id, c.name as empresa, e.mes,
           sum(e.cobrado)::bigint as cobrado_centimos, sum(e.consumidos)::bigint as creditos_consumidos,
           sum(e.coste)::bigint as coste_ia_usd_micros
      from eventos e join public.companies c on c.id = e.company_id
     group by e.company_id, c.name, e.mes
  ), alertas_agente as (
    select company_id, agent_id, count(*)::int as n
      from public.internal_alerts, lim
     where tipo = 'margen_superado' and creado_en >= lim.ini and creado_en < lim.fin
     group by company_id, agent_id
  ), por_agente as (
    select t.company_id, c.name as empresa, t.agent_id, coalesce(a.name, 'Agente eliminado') as agente,
           count(*)::int as tareas, sum(t.creditos_cobrados)::bigint as creditos_cobrados,
           sum(t.coste_ia_usd_micros)::bigint as coste_ia_usd_micros, coalesce(max(al.n), 0)::int as alertas_margen
      from public.task_costs t cross join lim
      join public.companies c on c.id = t.company_id
      left join public.agents a on a.id = t.agent_id and a.company_id = t.company_id
      left join alertas_agente al on al.company_id = t.company_id and al.agent_id is not distinct from t.agent_id
     where t.creado_en >= lim.ini and t.creado_en < lim.fin
     group by t.company_id, c.name, t.agent_id, a.name
  ), por_tipo as (
    select coalesce(tipo_tarea, 'sin_tipo') as tipo, count(*)::int as tareas,
           sum(coste_ia_usd_micros)::bigint as coste_ia_usd_micros, sum(creditos_cobrados)::bigint as creditos_cobrados
      from public.task_costs, lim where creado_en >= lim.ini and creado_en < lim.fin
     group by 1
  )
  select jsonb_build_object(
    'por_empresa_mes', coalesce((select jsonb_agg(to_jsonb(x) order by x.mes desc, x.empresa) from por_empresa_mes x), '[]'::jsonb),
    'por_agente', coalesce((select jsonb_agg(to_jsonb(x)) from por_agente x), '[]'::jsonb),
    'por_tipo', coalesce((select jsonb_agg(to_jsonb(x)) from por_tipo x), '[]'::jsonb),
    'saldo_vivo', (select jsonb_build_object(
        'creditos', coalesce(sum(creditos_restantes), 0)::bigint,
        'empresas', count(distinct company_id)::int)
       from public.credit_lots where caduca_en > now() and creditos_restantes > 0),
    'caducados_mes', (select coalesce(-sum(creditos), 0)::bigint from public.credit_ledger, lim
       where tipo = 'caducidad' and creado_en >= lim.ini and creado_en < lim.fin),
    'alertas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'tipo', x.tipo, 'empresa', c.name, 'agente', a.name, 'detalle', x.detalle, 'creadoEn', x.creado_en) order by x.creado_en desc)
      from (select * from public.internal_alerts, lim where creado_en >= lim.ini and creado_en < lim.fin
             order by creado_en desc limit 100) x
      join public.companies c on c.id = x.company_id
      left join public.agents a on a.id = x.agent_id and a.company_id = x.company_id), '[]'::jsonb)
  )
$$;
revoke all on function public.admin_margenes(date) from public, anon, authenticated;
grant execute on function public.admin_margenes(date) to service_role;
