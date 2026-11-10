-- Fase 2 · Sistema de créditos (ver CLAUDE.md, «Modelo de créditos»).
-- 1 crédito = 1 céntimo. Créditos y dinero son SIEMPRE enteros (el dinero, en céntimos).
--
-- Invariantes que esta migración garantiza en la base de datos (no en Next.js):
--   · creditos_restantes de un lote nunca es negativo ni supera lo comprado (check).
--   · Todo movimiento queda en credit_ledger, que es de solo inserción (trigger + RLS + permisos).
--   · consumir / reservar / confirmar / liberar son atómicas y se serializan por empresa
--     (bloqueo consultivo por empresa + SELECT ... FOR UPDATE sobre sus lotes).
--   · Se gasta primero lo que caduca antes (FIFO por caduca_en).
--   · Suma del libro de una empresa = créditos restantes en sus lotes − créditos reservados activos.
--   · Las funciones solo las ejecuta el servicio (service_role): el navegador no puede acuñar ni gastar créditos.

-- 1) Catálogo de packs --------------------------------------------------------------------------
-- No lleva company_id: es un catálogo común, de solo lectura para las empresas.
create table public.credit_packs (
  id text primary key check (id in ('prueba', 'inicio', 'pro', 'business', 'empresa')),
  nombre text not null,
  precio_centimos integer not null check (precio_centimos > 0),
  creditos integer not null check (creditos > 0),
  -- Créditos que da el pack cuando se paga como suscripción mensual (+10 %). null = no admite bono.
  creditos_bono_mensual integer check (creditos_bono_mensual is null or creditos_bono_mensual > creditos),
  dias_caducidad integer not null check (dias_caducidad > 0),
  solo_una_vez boolean not null default false,
  activo boolean not null default true
);

insert into public.credit_packs (id, nombre, precio_centimos, creditos, creditos_bono_mensual, dias_caducidad, solo_una_vez) values
  ('prueba',   'Prueba',   1900,   2000,   null,   30, true),
  ('inicio',   'Inicio',   4900,   5000,   5500,  365, false),
  ('pro',      'Pro',     14900,  16000,  17600,  365, false),
  ('business', 'Business', 39900,  45000,  49500,  365, false),
  ('empresa',  'Empresa', 99000, 120000, 132000,  365, false);

-- 2) Lotes: cada compra o regalo de créditos ----------------------------------------------------
create table public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  origen text not null check (origen in ('pack', 'bono_mensual', 'prueba', 'regalo', 'ajuste')),
  pack_id text references public.credit_packs (id),
  creditos_iniciales integer not null check (creditos_iniciales > 0),
  creditos_restantes integer not null,
  caduca_en timestamptz not null,
  creado_en timestamptz not null default now(),
  referencia_pago text,
  unique (company_id, id),
  constraint credit_lots_restantes_validos check (creditos_restantes >= 0 and creditos_restantes <= creditos_iniciales)
);
-- Orden de consumo: primero lo que caduca antes.
create index credit_lots_consumo_idx on public.credit_lots (company_id, caduca_en, creado_en) where creditos_restantes > 0;

-- 3) Libro contable: solo inserción -------------------------------------------------------------
-- company_id sin cascada (on delete restrict): el libro es constancia contable y no se borra con la empresa.
-- task_id, agent_id y department_id NO son claves foráneas a propósito: si se borra una tarea o un
-- contacto (RGPD), el libro no se toca. No debe contener datos personales (ni en `metadatos`).
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  tipo text not null check (tipo in ('compra', 'consumo', 'reserva', 'liberacion', 'caducidad', 'ajuste', 'reembolso')),
  -- Positivo suma al saldo disponible, negativo resta.
  creditos integer not null check (creditos <> 0),
  -- Nulo en reserva/liberación (no tocan lotes todavía).
  lot_id uuid,
  task_id uuid,
  agent_id uuid,
  department_id uuid,
  -- 'tarea_simple', 'tarea_estandar', 'tarea_experta', 'traspaso', 'correo', 'whatsapp', 'compra_pack', ...
  concepto text not null,
  -- Única por empresa y solo en la primera línea de una operación (una operación puede tocar varios lotes).
  clave_idempotencia text,
  metadatos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  -- Añadidas respecto al esquema pedido:
  operacion_id uuid not null default gen_random_uuid(), -- agrupa las líneas de una misma operación
  saldo_resultante integer,                              -- saldo disponible tras la operación
  foreign key (company_id, lot_id) references public.credit_lots (company_id, id),
  constraint credit_ledger_signo_segun_tipo check (
    (tipo in ('compra', 'liberacion') and creditos > 0)
    or (tipo in ('consumo', 'reserva', 'caducidad') and creditos < 0)
    or tipo in ('ajuste', 'reembolso')
  )
);
create unique index credit_ledger_idempotencia_uq on public.credit_ledger (company_id, clave_idempotencia)
  where clave_idempotencia is not null;
create index credit_ledger_empresa_idx on public.credit_ledger (company_id, creado_en desc);
create index credit_ledger_operacion_idx on public.credit_ledger (operacion_id);
create index credit_ledger_task_idx on public.credit_ledger (company_id, task_id) where task_id is not null;

create function public.credit_ledger_solo_insercion()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El libro de créditos es de solo inserción: % no está permitido (corrige con un movimiento nuevo)', tg_op
    using errcode = '42501';
end;
$$;

create trigger credit_ledger_no_update_delete
  before update or delete on public.credit_ledger
  for each row execute function public.credit_ledger_solo_insercion();
create trigger credit_ledger_no_truncate
  before truncate on public.credit_ledger
  for each statement execute function public.credit_ledger_solo_insercion();

-- 4) Reservas de créditos para tareas en curso ---------------------------------------------------
create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  task_id uuid not null,
  creditos integer not null check (creditos > 0),
  estado text not null default 'activa' check (estado in ('activa', 'confirmada', 'liberada', 'expirada')),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null default now() + interval '30 minutes',
  unique (company_id, id)
);
-- Una sola reserva activa por tarea.
create unique index credit_reservations_una_activa_uq on public.credit_reservations (company_id, task_id) where estado = 'activa';

-- 5) Ajustes de créditos de la empresa (una fila por empresa) ------------------------------------
create table public.company_credit_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  tope_mensual_creditos integer check (tope_mensual_creditos is null or tope_mensual_creditos >= 0),
  recarga_auto_activa boolean not null default false,
  recarga_auto_umbral integer check (recarga_auto_umbral is null or recarga_auto_umbral >= 0),
  recarga_auto_pack_id text references public.credit_packs (id),
  bono_mensual_pack_id text references public.credit_packs (id),
  aviso_20_enviado_en timestamptz,
  aviso_5_enviado_en timestamptz,
  estado_oficina text not null default 'activa'
    check (estado_oficina in ('activa', 'saldo_bajo', 'sin_saldo', 'pausada', 'pendiente_borrado')),
  pausada_en timestamptz,
  borrado_programado_en timestamptz,
  ultima_actividad_en timestamptz not null default now(),
  prueba_usada boolean not null default false
);

-- Toda empresa nueva (y las que ya existen) tiene su fila de ajustes.
create function public.company_credit_settings_alta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_credit_settings (company_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger companies_credit_settings
  after insert on public.companies
  for each row execute function public.company_credit_settings_alta();
insert into public.company_credit_settings (company_id) select id from public.companies on conflict do nothing;

-- 6) Coste interno real de cada tarea (NO lo ve el cliente) --------------------------------------
create table public.task_costs (
  task_id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid,
  modelo text not null,
  tokens_entrada bigint not null default 0 check (tokens_entrada >= 0),
  tokens_salida bigint not null default 0 check (tokens_salida >= 0),
  tokens_cache bigint not null default 0 check (tokens_cache >= 0),
  -- Millonésimas de dólar (entero: nunca decimales). 1 USD = 1.000.000.
  coste_ia_usd_micros bigint not null default 0 check (coste_ia_usd_micros >= 0),
  creditos_cobrados integer not null default 0 check (creditos_cobrados >= 0),
  creado_en timestamptz not null default now()
);
create index task_costs_company_idx on public.task_costs (company_id, creado_en desc);

-- 7) Row Level Security y permisos -----------------------------------------------------------------
alter table public.credit_packs enable row level security;
alter table public.credit_lots enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.company_credit_settings enable row level security;
alter table public.task_costs enable row level security;

-- Las empresas solo LEEN lo suyo. Todo lo que cambia créditos pasa por las funciones de abajo (servicio).
create policy credit_packs_select on public.credit_packs for select to authenticated using (true);
create policy credit_lots_select on public.credit_lots for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy credit_ledger_select on public.credit_ledger for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy credit_reservations_select on public.credit_reservations for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy company_credit_settings_select on public.company_credit_settings for select to authenticated
  using (company_id = (select public.current_company_id()));
-- task_costs: sin política de lectura para authenticated → el cliente no ve el coste interno.

-- El libro prohíbe UPDATE y DELETE también por política (además del trigger).
create policy credit_ledger_no_update on public.credit_ledger as restrictive for update to authenticated using (false);
create policy credit_ledger_no_delete on public.credit_ledger as restrictive for delete to authenticated using (false);

revoke all on public.credit_packs, public.credit_lots, public.credit_ledger, public.credit_reservations,
  public.company_credit_settings, public.task_costs from anon, authenticated;
grant select on public.credit_packs, public.credit_lots, public.credit_ledger, public.credit_reservations,
  public.company_credit_settings to authenticated;
grant select, insert, update, delete on public.credit_packs, public.credit_lots, public.credit_ledger,
  public.credit_reservations, public.company_credit_settings, public.task_costs to service_role;
-- Aunque el servicio pueda borrar, el trigger del libro lo impide.

-- 8) Saldo disponible por empresa -------------------------------------------------------------------
-- Disponible = lotes no caducados − reservas activas (nunca se muestra por debajo de 0).
create view public.company_credit_balance with (security_invoker = true) as
select
  c.id as company_id,
  l.en_lotes as creditos_en_lotes,
  r.reservados as creditos_reservados,
  greatest(l.en_lotes - r.reservados, 0) as saldo_disponible
from public.companies c
cross join lateral (
  select coalesce(sum(creditos_restantes), 0)::integer as en_lotes
  from public.credit_lots where company_id = c.id and caduca_en > now()
) l
cross join lateral (
  select coalesce(sum(creditos), 0)::integer as reservados
  from public.credit_reservations where company_id = c.id and estado = 'activa'
) r;
grant select on public.company_credit_balance to authenticated, service_role;

-- 9) Funciones internas (con prefijo _; nadie las llama desde fuera) -----------------------------------

-- Serializa todo lo que toca los créditos de una empresa y bloquea sus lotes (FOR UPDATE, en orden fijo).
create function public._credit_bloquear(p_company_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('credit:' || p_company_id::text, 0));
  perform 1 from public.credit_lots
   where company_id = p_company_id and creditos_restantes > 0
   order by caduca_en, creado_en, id
   for update;
end;
$$;

-- Saldo disponible ahora mismo (llamar con la empresa ya bloqueada).
create function public._credit_disponible(p_company_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
    coalesce((select sum(creditos_restantes) from public.credit_lots where company_id = p_company_id and caduca_en > now()), 0)
    - coalesce((select sum(creditos) from public.credit_reservations where company_id = p_company_id and estado = 'activa'), 0),
    0)::integer
$$;

-- Caduca las reservas vencidas de la empresa y las libera en el libro.
create function public._credit_expirar_reservas(p_company_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  r public.credit_reservations;
begin
  for r in
    select * from public.credit_reservations
     where company_id = p_company_id and estado = 'activa' and expira_en <= now()
     order by creado_en for update
  loop
    update public.credit_reservations set estado = 'expirada' where id = r.id;
    insert into public.credit_ledger (company_id, tipo, creditos, task_id, concepto, metadatos)
    values (r.company_id, 'liberacion', r.creditos, r.task_id, 'reserva_expirada', jsonb_build_object('reserva_id', r.id));
  end loop;
end;
$$;

-- Descuenta de los lotes que caducan antes y escribe una línea de libro por lote tocado.
-- Llamar con la empresa ya bloqueada. p_parcial = true cobra como mucho el saldo disponible (sin error).
create function public._credit_descontar(
  p_company_id uuid, p_creditos integer, p_concepto text, p_task_id uuid, p_agent_id uuid, p_department_id uuid,
  p_clave text, p_metadatos jsonb, p_parcial boolean
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_disponible integer := public._credit_disponible(p_company_id);
  v_cobrar integer := p_creditos;
  v_falta integer;
  v_op uuid := gen_random_uuid();
  v_tomar integer;
  v_primera boolean := true;
  v_meta jsonb := coalesce(p_metadatos, '{}'::jsonb);
  lot public.credit_lots;
begin
  if v_disponible < p_creditos then
    if not p_parcial then
      raise exception 'SALDO_INSUFICIENTE: se piden % créditos y hay % disponibles', p_creditos, v_disponible
        using errcode = 'CR001',
              detail = format('empresa=%s pedidos=%s disponibles=%s', p_company_id, p_creditos, v_disponible),
              hint = 'Compra un pack de créditos o espera al bono mensual.';
    end if;
    v_cobrar := v_disponible;
    v_meta := v_meta || jsonb_build_object('no_cobrado', p_creditos - v_disponible);
  end if;

  v_falta := v_cobrar;
  if v_cobrar > 0 then
    for lot in
      select * from public.credit_lots
       where company_id = p_company_id and creditos_restantes > 0 and caduca_en > now()
       order by caduca_en, creado_en, id
    loop
      exit when v_falta = 0;
      v_tomar := least(lot.creditos_restantes, v_falta);
      update public.credit_lots set creditos_restantes = creditos_restantes - v_tomar where id = lot.id;
      insert into public.credit_ledger (company_id, tipo, creditos, lot_id, task_id, agent_id, department_id, concepto,
                                        clave_idempotencia, metadatos, operacion_id, saldo_resultante)
      values (p_company_id, 'consumo', -v_tomar, lot.id, p_task_id, p_agent_id, p_department_id, p_concepto,
              case when v_primera then p_clave end, v_meta, v_op, v_disponible - v_cobrar);
      v_primera := false;
      v_falta := v_falta - v_tomar;
    end loop;
  end if;

  update public.company_credit_settings set ultima_actividad_en = now() where company_id = p_company_id;

  return jsonb_build_object('operacion_id', v_op, 'consumido', v_cobrar, 'saldo', v_disponible - v_cobrar, 'duplicado', false);
end;
$$;

-- Resultado anterior de una operación ya hecha con esa clave (o null si no existe).
create function public._credit_resultado_previo(p_company_id uuid, p_clave text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'operacion_id', l.operacion_id,
    'consumido', (select coalesce(-sum(x.creditos) filter (where x.tipo = 'consumo'), 0)::integer
                    from public.credit_ledger x where x.operacion_id = l.operacion_id),
    'saldo', l.saldo_resultante,
    'lot_id', l.lot_id,
    'reserva_id', l.metadatos -> 'reserva_id',
    'duplicado', true)
  from public.credit_ledger l
  where l.company_id = p_company_id and l.clave_idempotencia = p_clave
$$;

-- 10) Funciones públicas (solo service_role) ---------------------------------------------------------

-- Consumir créditos de forma atómica. Devuelve {operacion_id, consumido, saldo, duplicado}.
-- Sin saldo suficiente: error SQLSTATE CR001 «SALDO_INSUFICIENTE» y no se descuenta nada.
-- Misma clave_idempotencia: devuelve el resultado anterior sin descontar otra vez.
create function public.consumir_creditos(
  p_company_id uuid, p_creditos integer, p_concepto text,
  p_task_id uuid default null, p_agent_id uuid default null, p_department_id uuid default null,
  p_clave_idempotencia text default null, p_metadatos jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_previo jsonb;
begin
  if p_creditos is null or p_creditos <= 0 then
    raise exception 'CREDITOS_INVALIDOS: los créditos a consumir deben ser un entero positivo' using errcode = '22023';
  end if;
  if p_concepto is null or p_concepto = '' then
    raise exception 'CONCEPTO_OBLIGATORIO' using errcode = '22023';
  end if;
  perform public._credit_bloquear(p_company_id);
  if p_clave_idempotencia is not null then
    v_previo := public._credit_resultado_previo(p_company_id, p_clave_idempotencia);
    if v_previo is not null then return v_previo; end if;
  end if;
  perform public._credit_expirar_reservas(p_company_id);
  return public._credit_descontar(p_company_id, p_creditos, p_concepto, p_task_id, p_agent_id, p_department_id,
                                  p_clave_idempotencia, p_metadatos, false);
end;
$$;

-- Reservar créditos para una tarea en curso (no toca los lotes: reduce el saldo disponible).
-- Una sola reserva activa por tarea: repetir la llamada devuelve la existente.
create function public.reservar_creditos(
  p_company_id uuid, p_task_id uuid, p_creditos integer,
  p_agent_id uuid default null, p_department_id uuid default null, p_ttl_segundos integer default 1800
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_res public.credit_reservations;
  v_disp integer;
begin
  if p_creditos is null or p_creditos <= 0 then
    raise exception 'CREDITOS_INVALIDOS: los créditos a reservar deben ser un entero positivo' using errcode = '22023';
  end if;
  perform public._credit_bloquear(p_company_id);
  perform public._credit_expirar_reservas(p_company_id);

  select * into v_res from public.credit_reservations
   where company_id = p_company_id and task_id = p_task_id and estado = 'activa';
  if found then
    return jsonb_build_object('reserva_id', v_res.id, 'reservado', v_res.creditos,
                              'saldo', public._credit_disponible(p_company_id), 'duplicado', true);
  end if;

  v_disp := public._credit_disponible(p_company_id);
  if v_disp < p_creditos then
    raise exception 'SALDO_INSUFICIENTE: se piden reservar % créditos y hay % disponibles', p_creditos, v_disp
      using errcode = 'CR001',
            detail = format('empresa=%s pedidos=%s disponibles=%s', p_company_id, p_creditos, v_disp),
            hint = 'Compra un pack de créditos o espera al bono mensual.';
  end if;

  insert into public.credit_reservations (company_id, task_id, creditos, expira_en)
  values (p_company_id, p_task_id, p_creditos, now() + make_interval(secs => p_ttl_segundos))
  returning * into v_res;
  insert into public.credit_ledger (company_id, tipo, creditos, task_id, agent_id, department_id, concepto, metadatos, saldo_resultante)
  values (p_company_id, 'reserva', -p_creditos, p_task_id, p_agent_id, p_department_id, 'reserva_tarea',
          jsonb_build_object('reserva_id', v_res.id), v_disp - p_creditos);

  return jsonb_build_object('reserva_id', v_res.id, 'reservado', p_creditos, 'saldo', v_disp - p_creditos, 'duplicado', false);
end;
$$;

-- Confirmar una reserva: consume lo realmente gastado (0 ≤ gastado ≤ reservado) y libera el resto.
create function public.confirmar_reserva(
  p_company_id uuid, p_reserva_id uuid, p_creditos_gastados integer, p_concepto text,
  p_agent_id uuid default null, p_department_id uuid default null,
  p_clave_idempotencia text default null, p_metadatos jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_res public.credit_reservations;
  v_previo jsonb;
  v_resultado jsonb;
begin
  if p_creditos_gastados is null or p_creditos_gastados < 0 then
    raise exception 'CREDITOS_INVALIDOS: lo gastado debe ser un entero ≥ 0' using errcode = '22023';
  end if;
  perform public._credit_bloquear(p_company_id);
  if p_clave_idempotencia is not null then
    v_previo := public._credit_resultado_previo(p_company_id, p_clave_idempotencia);
    if v_previo is not null then return v_previo; end if;
  end if;

  select * into v_res from public.credit_reservations where id = p_reserva_id and company_id = p_company_id for update;
  if not found then
    raise exception 'RESERVA_NO_ENCONTRADA' using errcode = 'CR002';
  end if;
  if v_res.estado <> 'activa' then
    raise exception 'RESERVA_NO_ACTIVA: la reserva está %', v_res.estado using errcode = 'CR003';
  end if;
  if p_creditos_gastados > v_res.creditos then
    raise exception 'GASTO_SUPERA_RESERVA: se gastaron % y solo se reservaron %', p_creditos_gastados, v_res.creditos
      using errcode = 'CR004', hint = 'Consume la diferencia con consumir_creditos.';
  end if;

  -- 1) La reserva deja de contar y se libera entera en el libro...
  update public.credit_reservations set estado = 'confirmada' where id = v_res.id;
  insert into public.credit_ledger (company_id, tipo, creditos, task_id, agent_id, department_id, concepto, metadatos)
  values (p_company_id, 'liberacion', v_res.creditos, v_res.task_id, p_agent_id, p_department_id, 'confirmacion_reserva',
          jsonb_build_object('reserva_id', v_res.id));
  -- 2) ...y se consume solo lo gastado. Si un lote caducó entre medias, se cobra lo posible y se anota lo no cobrado.
  v_resultado := public._credit_descontar(p_company_id, p_creditos_gastados, p_concepto, v_res.task_id, p_agent_id,
                                          p_department_id, p_clave_idempotencia,
                                          coalesce(p_metadatos, '{}'::jsonb) || jsonb_build_object('reserva_id', v_res.id), true);
  return v_resultado || jsonb_build_object('liberado', v_res.creditos - p_creditos_gastados, 'reserva_id', v_res.id);
end;
$$;

-- Liberar una reserva sin gastar nada (la tarea falló o se canceló).
create function public.liberar_reserva(p_company_id uuid, p_reserva_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_res public.credit_reservations;
begin
  perform public._credit_bloquear(p_company_id);
  select * into v_res from public.credit_reservations where id = p_reserva_id and company_id = p_company_id for update;
  if not found then
    raise exception 'RESERVA_NO_ENCONTRADA' using errcode = 'CR002';
  end if;
  if v_res.estado in ('liberada', 'expirada') then
    return jsonb_build_object('reserva_id', v_res.id, 'liberado', 0, 'saldo', public._credit_disponible(p_company_id), 'duplicado', true);
  end if;
  if v_res.estado <> 'activa' then
    raise exception 'RESERVA_NO_ACTIVA: la reserva está %', v_res.estado using errcode = 'CR003';
  end if;
  update public.credit_reservations set estado = 'liberada' where id = v_res.id;
  insert into public.credit_ledger (company_id, tipo, creditos, task_id, concepto, metadatos, saldo_resultante)
  values (p_company_id, 'liberacion', v_res.creditos, v_res.task_id, 'reserva_liberada',
          jsonb_build_object('reserva_id', v_res.id), public._credit_disponible(p_company_id));
  return jsonb_build_object('reserva_id', v_res.id, 'liberado', v_res.creditos,
                            'saldo', public._credit_disponible(p_company_id), 'duplicado', false);
end;
$$;

-- Marca como expiradas las reservas vencidas de todas las empresas (para un cron).
create function public.expirar_reservas()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  c uuid;
  n integer := 0;
begin
  for c in select distinct company_id from public.credit_reservations where estado = 'activa' and expira_en <= now() loop
    perform public._credit_bloquear(c);
    perform public._credit_expirar_reservas(c);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Pone a 0 los lotes caducados y registra una línea 'caducidad' por cada uno (para un cron).
create function public.caducar_lotes()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  cand record;
  lot public.credit_lots;
  v_lotes integer := 0;
  v_creditos integer := 0;
begin
  for cand in
    select id, company_id from public.credit_lots where creditos_restantes > 0 and caduca_en <= now() order by company_id, caduca_en
  loop
    perform public._credit_bloquear(cand.company_id);
    select * into lot from public.credit_lots where id = cand.id and creditos_restantes > 0 and caduca_en <= now() for update;
    if found then
      insert into public.credit_ledger (company_id, tipo, creditos, lot_id, concepto, metadatos)
      values (lot.company_id, 'caducidad', -lot.creditos_restantes, lot.id, 'caducidad_lote',
              jsonb_build_object('caduco_en', lot.caduca_en));
      update public.credit_lots set creditos_restantes = 0 where id = lot.id;
      v_lotes := v_lotes + 1;
      v_creditos := v_creditos + lot.creditos_restantes;
    end if;
  end loop;
  return jsonb_build_object('lotes', v_lotes, 'creditos', v_creditos);
end;
$$;

-- Añadir un lote (compra, bono, prueba, regalo o ajuste). Devuelve {lot_id, creditos, caduca_en, saldo, duplicado}.
--   · 'pack' / 'prueba' / 'bono_mensual': créditos y caducidad salen del pack (bono_mensual usa creditos_bono_mensual).
--   · 'regalo' / 'ajuste': hay que indicar p_creditos y p_dias_caducidad (o pack_id para tomar los días del pack).
--   · Un pack «solo una vez» (prueba) falla si la empresa ya lo usó.
create function public.anadir_lote(
  p_company_id uuid, p_origen text, p_pack_id text default null, p_creditos integer default null,
  p_dias_caducidad integer default null, p_referencia_pago text default null, p_clave_idempotencia text default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pack public.credit_packs;
  v_creditos integer;
  v_dias integer;
  v_lot public.credit_lots;
  v_previo jsonb;
  v_saldo integer;
  v_ajustes public.company_credit_settings;
begin
  if p_origen not in ('pack', 'bono_mensual', 'prueba', 'regalo', 'ajuste') then
    raise exception 'ORIGEN_INVALIDO: %', p_origen using errcode = '22023';
  end if;
  perform public._credit_bloquear(p_company_id);
  if p_clave_idempotencia is not null then
    v_previo := public._credit_resultado_previo(p_company_id, p_clave_idempotencia);
    if v_previo is not null then return v_previo; end if;
  end if;

  if p_pack_id is not null then
    select * into v_pack from public.credit_packs where id = p_pack_id;
    if not found then raise exception 'PACK_NO_ENCONTRADO: %', p_pack_id using errcode = 'CR005'; end if;
    if not v_pack.activo and p_origen in ('pack', 'bono_mensual', 'prueba') then
      raise exception 'PACK_INACTIVO: %', p_pack_id using errcode = 'CR005';
    end if;
  end if;

  if p_origen in ('pack', 'bono_mensual', 'prueba') then
    if p_pack_id is null then raise exception 'PACK_OBLIGATORIO para el origen %', p_origen using errcode = '22023'; end if;
    if p_origen = 'prueba' and p_pack_id <> 'prueba' then
      raise exception 'El origen prueba solo admite el pack prueba' using errcode = '22023';
    end if;
    if p_origen = 'bono_mensual' then
      if v_pack.creditos_bono_mensual is null then
        raise exception 'BONO_NO_DISPONIBLE: el pack % no admite bono mensual', p_pack_id using errcode = 'CR005';
      end if;
      v_creditos := v_pack.creditos_bono_mensual;
    else
      v_creditos := v_pack.creditos;
    end if;
    if p_creditos is not null and p_creditos <> v_creditos then
      raise exception 'CREDITOS_NO_COINCIDEN: el pack da % y se indicaron %', v_creditos, p_creditos using errcode = '22023';
    end if;
    v_dias := v_pack.dias_caducidad;
    if p_dias_caducidad is not null and p_dias_caducidad <> v_dias then
      raise exception 'DIAS_NO_COINCIDEN: el pack caduca a los % días', v_dias using errcode = '22023';
    end if;
    if v_pack.solo_una_vez then
      select * into v_ajustes from public.company_credit_settings where company_id = p_company_id for update;
      if v_ajustes.prueba_usada then
        raise exception 'PACK_YA_USADO: la empresa ya usó el pack %', p_pack_id using errcode = 'CR006';
      end if;
      update public.company_credit_settings set prueba_usada = true where company_id = p_company_id;
    end if;
  else
    v_creditos := p_creditos;
    v_dias := coalesce(p_dias_caducidad, v_pack.dias_caducidad);
  end if;

  if v_creditos is null or v_creditos <= 0 then
    raise exception 'CREDITOS_INVALIDOS: los créditos del lote deben ser un entero positivo' using errcode = '22023';
  end if;
  if v_dias is null or v_dias <= 0 then
    raise exception 'DIAS_INVALIDOS: indica los días de caducidad' using errcode = '22023';
  end if;

  insert into public.credit_lots (company_id, origen, pack_id, creditos_iniciales, creditos_restantes, caduca_en, referencia_pago)
  values (p_company_id, p_origen, p_pack_id, v_creditos, v_creditos, now() + make_interval(days => v_dias), p_referencia_pago)
  returning * into v_lot;

  v_saldo := public._credit_disponible(p_company_id);
  insert into public.credit_ledger (company_id, tipo, creditos, lot_id, concepto, clave_idempotencia, metadatos, saldo_resultante)
  values (p_company_id,
          case when p_origen in ('regalo', 'ajuste') then 'ajuste' else 'compra' end,
          v_creditos, v_lot.id,
          case p_origen when 'pack' then 'compra_pack' else p_origen end,
          p_clave_idempotencia,
          jsonb_build_object('pack_id', p_pack_id, 'origen', p_origen),
          v_saldo);

  return jsonb_build_object('lot_id', v_lot.id, 'creditos', v_creditos, 'caduca_en', v_lot.caduca_en,
                            'saldo', v_saldo, 'duplicado', false);
end;
$$;

-- Solo el servicio ejecuta estas funciones: el navegador (authenticated/anon) no puede acuñar ni gastar créditos.
do $$
declare
  f text;
begin
  foreach f in array array[
    '_credit_bloquear(uuid)', '_credit_disponible(uuid)', '_credit_expirar_reservas(uuid)',
    '_credit_descontar(uuid, integer, text, uuid, uuid, uuid, text, jsonb, boolean)', '_credit_resultado_previo(uuid, text)',
    'consumir_creditos(uuid, integer, text, uuid, uuid, uuid, text, jsonb)',
    'reservar_creditos(uuid, uuid, integer, uuid, uuid, integer)',
    'confirmar_reserva(uuid, uuid, integer, text, uuid, uuid, text, jsonb)',
    'liberar_reserva(uuid, uuid)', 'expirar_reservas()', 'caducar_lotes()',
    'anadir_lote(uuid, text, text, integer, integer, text, text)',
    'company_credit_settings_alta()', 'credit_ledger_solo_insercion()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
