-- Fase 2 · Base común de conexiones con aplicaciones externas (OAuth genérico, claves de API, dominio).
-- Los tokens viven cifrados en Supabase Vault (vault.secrets); company_connections solo guarda su id (token_ref).
-- Todo lo que toca un secreto son funciones SECURITY DEFINER que solo ejecuta el servidor (service_role).

-- 1) company_connections: una conexión por empresa y proveedor, y control de renovación ----------------------------------------
alter table public.company_connections
  add column renovando_hasta timestamptz,   -- «candado» para que dos procesos no renueven el mismo token a la vez
  add column renovada_en timestamptz,
  add column tipo_auth text check (tipo_auth in ('oauth2', 'api_key', 'dominio')),
  add constraint company_connections_proveedor_unico unique (company_id, proveedor),
  add constraint company_connections_token_coherente check (estado <> 'conectado' or token_ref is not null);

-- 2) El aviso a la empresa cuando una conexión caduca --------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check
  check (tipo in (
    'saldo_bajo_20', 'saldo_bajo_5', 'sin_saldo', 'recarga_automatica',
    'lote_por_caducar', 'oficina_pausada', 'borrado_programado', 'bono_renovado',
    'conexion_caducada'
  ));

-- 3) Estados del flujo OAuth: de un solo uso y de corta vida. Aquí vive el verificador PKCE (nunca viaja en la URL). -------------
create table public.oauth_states (
  nonce uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null,
  proveedor text not null,
  code_verifier text,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  usado_en timestamptz,
  foreign key (company_id, user_id) references public.users (company_id, id) on delete cascade
);
create index oauth_states_expira_idx on public.oauth_states (expira_en);
alter table public.oauth_states enable row level security;   -- sin políticas ni permisos: solo service_role
revoke all on public.oauth_states from anon, authenticated;
grant select, insert, update, delete on public.oauth_states to service_role;

-- Consume el estado UNA sola vez, solo para esa empresa, ese usuario y ese proveedor, y solo si no ha caducado.
create function public.conexion_consumir_estado(p_nonce uuid, p_company_id uuid, p_user_id uuid, p_proveedor text)
returns table (code_verifier text)
language sql
security definer
set search_path = ''
as $$
  update public.oauth_states s set usado_en = now()
   where s.nonce = p_nonce and s.company_id = p_company_id and s.user_id = p_user_id and s.proveedor = p_proveedor
     and s.usado_en is null and s.expira_en > now()
  returning s.code_verifier
$$;

-- 4) Guardar la conexión y su secreto en UNA transacción (nunca una conexión «conectada» sin token) ---------------------------
create function public.conexion_guardar(
  p_company_id uuid, p_user_id uuid, p_proveedor text, p_tipo_auth text, p_cuenta text, p_scopes jsonb, p_caduca timestamptz, p_secreto text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_anterior uuid;
  v_ref uuid;
begin
  insert into public.company_connections (company_id, proveedor, estado, tipo_auth, cuenta_externa, scopes, caduca_en, conectado_por, conectado_en, ultimo_error, token_ref)
  values (p_company_id, p_proveedor, 'desconectado', p_tipo_auth, p_cuenta, coalesce(p_scopes, '[]'::jsonb), p_caduca, p_user_id, now(), null, null)
  on conflict (company_id, proveedor) do update
    set tipo_auth = excluded.tipo_auth, cuenta_externa = excluded.cuenta_externa, scopes = excluded.scopes, caduca_en = excluded.caduca_en,
        conectado_por = excluded.conectado_por, conectado_en = now(), ultimo_error = null, renovando_hasta = null
  returning id, token_ref into v_id, v_anterior;
  v_ref := vault.create_secret(p_secreto, 'conexion:' || v_id || ':' || gen_random_uuid(), 'Credenciales de company_connections');
  update public.company_connections set token_ref = v_ref, estado = 'conectado' where id = v_id;
  if v_anterior is not null then delete from vault.secrets where id = v_anterior; end if;
  return v_id;
end;
$$;

-- Renovación: cambia el secreto y la caducidad (y levanta el candado).
create function public.conexion_actualizar_token(p_company_id uuid, p_connection_id uuid, p_secreto text, p_caduca timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior uuid;
  v_ref uuid;
begin
  select token_ref into v_anterior from public.company_connections
   where id = p_connection_id and company_id = p_company_id and estado in ('conectado', 'caducado', 'error') for update;
  if not found then raise exception 'Conexión no encontrada' using errcode = 'P0002'; end if;
  v_ref := vault.create_secret(p_secreto, 'conexion:' || p_connection_id || ':' || gen_random_uuid(), 'Credenciales de company_connections');
  update public.company_connections
     set token_ref = v_ref, caduca_en = p_caduca, estado = 'conectado', ultimo_error = null, renovando_hasta = null, renovada_en = now()
   where id = p_connection_id;
  if v_anterior is not null then delete from vault.secrets where id = v_anterior; end if;
end;
$$;

-- «Candado» de renovación: true si este proceso es el que renueva (el candado dura p_segundos).
create function public.conexion_reclamar_renovacion(p_company_id uuid, p_connection_id uuid, p_segundos integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.company_connections c set renovando_hasta = now() + make_interval(secs => p_segundos)
     where c.id = p_connection_id and c.company_id = p_company_id and c.estado = 'conectado'
       and (c.renovando_hasta is null or c.renovando_hasta < now())
    returning 1)
  select exists (select 1 from u)
$$;

-- Caducada: la renovación falló. Se borra el secreto (ya no sirve), se anota el motivo (sin datos sensibles) y se avisa a la empresa.
create function public.conexion_marcar_caducada(p_company_id uuid, p_connection_id uuid, p_nombre text, p_motivo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref uuid;
  v_estado text;
begin
  select token_ref, estado into v_ref, v_estado from public.company_connections
   where id = p_connection_id and company_id = p_company_id for update;
  if not found or v_estado <> 'conectado' then return false; end if;
  update public.company_connections set estado = 'caducado', token_ref = null, ultimo_error = left(p_motivo, 300), renovando_hasta = null
   where id = p_connection_id;
  if v_ref is not null then delete from vault.secrets where id = v_ref; end if;
  insert into public.notifications (company_id, tipo, titulo, cuerpo, metadatos)
  values (p_company_id, 'conexion_caducada', format('Hay que volver a conectar %s', p_nombre),
          format('La conexión con %s ha caducado y no se ha podido renovar. Los agentes que la usan no pueden trabajar con ella hasta que la vuelvas a conectar.', p_nombre),
          jsonb_build_object('conexion_id', p_connection_id));
  return true;
end;
$$;

-- Desconectar: borra el secreto de Vault y deja la fila como «desconectado» (queda constancia de que existió).
create function public.conexion_desconectar(p_company_id uuid, p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref uuid;
begin
  select token_ref into v_ref from public.company_connections where id = p_connection_id and company_id = p_company_id for update;
  if not found then return false; end if;
  update public.company_connections set estado = 'desconectado', token_ref = null, caduca_en = null, ultimo_error = null, renovando_hasta = null
   where id = p_connection_id;
  if v_ref is not null then delete from vault.secrets where id = v_ref; end if;
  return true;
end;
$$;

revoke all on function public.conexion_consumir_estado(uuid, uuid, uuid, text), public.conexion_guardar(uuid, uuid, text, text, text, jsonb, timestamptz, text),
  public.conexion_actualizar_token(uuid, uuid, text, timestamptz), public.conexion_reclamar_renovacion(uuid, uuid, integer),
  public.conexion_marcar_caducada(uuid, uuid, text, text), public.conexion_desconectar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.conexion_consumir_estado(uuid, uuid, uuid, text), public.conexion_guardar(uuid, uuid, text, text, text, jsonb, timestamptz, text),
  public.conexion_actualizar_token(uuid, uuid, text, timestamptz), public.conexion_reclamar_renovacion(uuid, uuid, integer),
  public.conexion_marcar_caducada(uuid, uuid, text, text), public.conexion_desconectar(uuid, uuid) to service_role;

-- 5) La empresa no debe poder tocar conexiones a mano (ni ver el id del secreto): solo lectura de columnas públicas -------------
drop policy if exists company_connections_write on public.company_connections;
revoke insert, update, delete on public.company_connections from authenticated;
grant select (id, company_id, proveedor, estado, cuenta_externa, scopes, caduca_en, conectado_por, conectado_en, ultimo_error, tipo_auth)
  on public.company_connections to authenticated;
