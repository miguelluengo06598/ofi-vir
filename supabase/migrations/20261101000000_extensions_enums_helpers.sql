-- Fase 2 · Modelo de datos (1/6): extensiones, tipos enumerados y tarifas de modelos.
-- Regla de oro: toda tabla con datos de empresa lleva company_id y Row Level Security.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create type public.user_role as enum ('owner', 'admin', 'member');
create type public.agent_status as enum ('working', 'waiting', 'paused', 'error', 'expert');

create type public.email_direction as enum ('inbound', 'outbound');
-- Estado de un correo concreto. Los entrantes son siempre 'received'.
create type public.email_delivery_status as enum ('pending_approval', 'sent', 'delivered', 'bounced', 'received');
-- Estado del hilo (lo que muestra la pestaña Correos).
create type public.email_thread_status as enum ('pending_approval', 'sent', 'delivered', 'bounced', 'replied');

create type public.approval_kind as enum ('email', 'publish', 'spend', 'other');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.task_status as enum ('running', 'expert', 'approval', 'done', 'failed');
create type public.handoff_kind as enum ('lead', 'aviso', 'peticion', 'informe');
create type public.handoff_status as enum ('sent', 'received', 'in_progress', 'done', 'rejected');

create type public.memory_node_type as enum ('contacto', 'empresa', 'campana', 'correo', 'dato', 'tarea', 'agente');
create type public.memory_edge_kind as enum ('trabaja_en', 'llego_por', 'recibio', 'respondio', 'tiene_pendiente', 'creado_por');

-- Tarifas por modelo, en créditos por millón de tokens. No son datos de empresa (no llevan company_id):
-- las leen todos los usuarios autenticados y solo las cambia el servicio.
create table public.model_pricing (
  model text primary key,
  input_credits_per_mtok numeric(12, 4) not null check (input_credits_per_mtok >= 0),
  output_credits_per_mtok numeric(12, 4) not null check (output_credits_per_mtok >= 0)
);

-- VALORES DE EJEMPLO: ajustar a la tarifa vigente de cada modelo antes de cobrar nada.
insert into public.model_pricing (model, input_credits_per_mtok, output_credits_per_mtok) values
  ('claude-haiku-5-5', 100, 500),
  ('claude-sonnet-5-5', 300, 1500);
