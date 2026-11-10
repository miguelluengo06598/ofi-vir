-- Fase 2 · Compras de créditos (simuladas en local; Stripe llegará después) y resumen de consumo del mes.

-- 1) Compras ---------------------------------------------------------------------------------------------------------
-- Registro de cada compra de un pack. Es un documento contable: company_id sin cascada (on delete restrict).
-- importe_centimos = precio del pack (base imponible); iva_centimos = 21 % sobre la base; el total se calcula.
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  pack_id text not null references public.credit_packs (id),
  modalidad text not null check (modalidad in ('unico', 'bono_mensual')),
  importe_centimos integer not null check (importe_centimos >= 0),
  iva_centimos integer not null check (iva_centimos >= 0),
  total_centimos integer generated always as (importe_centimos + iva_centimos) stored,
  estado text not null default 'simulada' check (estado in ('simulada', 'pagada', 'fallida', 'reembolsada')),
  -- Id del cobro en la pasarela (Stripe). En las compras simuladas: «simulada:<id>».
  referencia_externa text,
  creado_en timestamptz not null default now(),
  unique (company_id, id)
);
create index purchases_company_idx on public.purchases (company_id, creado_en desc);
create unique index purchases_referencia_uq on public.purchases (referencia_externa) where referencia_externa is not null;

alter table public.purchases enable row level security;
-- Datos de facturación: solo propietarios y administradores de la empresa, y solo lectura. Las escribe el servicio.
create policy purchases_select on public.purchases for select to authenticated
  using (company_id = (select public.current_company_id()) and (select public.current_user_role()) in ('owner', 'admin'));
revoke all on public.purchases from anon, authenticated;
grant select on public.purchases to authenticated;
grant select, insert, update, delete on public.purchases to service_role;

-- 2) Consumo del mes por agente, departamento y tipo de tarea ------------------------------------------------------------
-- Mes natural en hora de Madrid. Los nombres salen de agents/departments SOLO de la misma empresa.
create function public.resumen_consumo_mes(p_company_id uuid, p_ahora timestamptz default now())
returns jsonb
language sql
stable
set search_path = ''
as $$
  with l as (
    select agent_id, department_id, concepto, -creditos as creditos
      from public.credit_ledger
     where company_id = p_company_id and tipo = 'consumo'
       and creado_en >= (date_trunc('month', p_ahora at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')
  )
  select jsonb_build_object(
    'total', coalesce((select sum(creditos) from l), 0)::integer,
    'por_agente', coalesce((
      select jsonb_agg(jsonb_build_object('agent_id', x.agent_id, 'nombre', coalesce(a.name, 'Sin agente'), 'creditos', x.c) order by x.c desc, a.name)
        from (select agent_id, sum(creditos)::integer as c from l group by agent_id) x
        left join public.agents a on a.id = x.agent_id and a.company_id = p_company_id), '[]'::jsonb),
    'por_departamento', coalesce((
      select jsonb_agg(jsonb_build_object('department_id', x.department_id, 'nombre', coalesce(d.name, 'Sin departamento'), 'creditos', x.c) order by x.c desc, d.name)
        from (select department_id, sum(creditos)::integer as c from l group by department_id) x
        left join public.departments d on d.id = x.department_id and d.company_id = p_company_id), '[]'::jsonb),
    'por_concepto', coalesce((
      select jsonb_agg(jsonb_build_object('concepto', x.concepto, 'creditos', x.c) order by x.c desc, x.concepto)
        from (select concepto, sum(creditos)::integer as c from l group by concepto) x), '[]'::jsonb)
  )
$$;
revoke all on function public.resumen_consumo_mes(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.resumen_consumo_mes(uuid, timestamptz) to service_role;
