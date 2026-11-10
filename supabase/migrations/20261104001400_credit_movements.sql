-- Historial de movimientos del libro para la vista Créditos: una fila por operación (una operación puede tocar varios lotes),
-- paginado y filtrable por tipo. Reservas y liberaciones son internas y no se muestran.
create function public.movimientos_creditos(
  p_company_id uuid, p_tipo text default null, p_limite integer default 20, p_desplazamiento integer default 0
) returns jsonb
language sql
stable
set search_path = ''
as $$
  with ops as (
    select operacion_id,
           min(tipo) as tipo,
           sum(creditos)::integer as creditos,
           min(concepto) as concepto,
           min(agent_id::text) as agent_id,
           min(creado_en) as creado_en,
           max(saldo_resultante) filter (where saldo_resultante is not null) as saldo_resultante
      from public.credit_ledger
     where company_id = p_company_id
       and tipo in ('compra', 'consumo', 'caducidad', 'ajuste', 'reembolso')
       and (p_tipo is null or tipo = p_tipo)
     group by operacion_id
  ), pagina as (
    select o.*, a.name as agente
      from ops o left join public.agents a on a.id::text = o.agent_id and a.company_id = p_company_id
     order by o.creado_en desc, o.operacion_id
     limit greatest(least(p_limite, 100), 1) offset greatest(p_desplazamiento, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from ops),
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', operacion_id, 'tipo', tipo, 'creditos', creditos, 'concepto', concepto,
        'agente', agente, 'creadoEn', creado_en, 'saldoResultante', saldo_resultante) order by creado_en desc, operacion_id) from pagina), '[]'::jsonb)
  )
$$;
revoke all on function public.movimientos_creditos(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.movimientos_creditos(uuid, text, integer, integer) to service_role;
