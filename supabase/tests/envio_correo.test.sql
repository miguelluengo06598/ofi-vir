-- Tests del envío de correo: aprobar un borrador con su texto exacto, huella, reserva del envío y estados de entrega.
-- Se deshace al terminar.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Seed: aprobación pendiente de Irene Soler para Laura (borrador 456dac4a). Marcos es propietario de la empresa A.
create temp table ids as select
  'a64499d1-7f43-4a43-abc8-41a313dc4018'::uuid as company_a,
  '451c5e13-ab4e-47d4-a16f-d2ff95f6b5bc'::uuid as approval,
  '456dac4a-404e-4a17-a757-f7b61a2f1621'::uuid as draft,
  '0c33590a-4c2a-4b32-a388-2008558688f7'::uuid as marcos,
  'b0000000-0000-4000-8000-000000000001'::uuid as company_b;
insert into public.companies (id, name) values ((select company_b from ids), 'Taller Delta');

-- Un usuario de otra empresa no puede aprobar.
select throws_ok(
  $q$select public.approve_email_draft('b0000000-0000-4000-8000-000000000001', '451c5e13-ab4e-47d4-a16f-d2ff95f6b5bc', '0c33590a-4c2a-4b32-a388-2008558688f7', 'x', 'y')$q$,
  '23514', 'La aprobación no existe o ya está resuelta', 'otra empresa no puede aprobar');
-- Alguien que no es de la empresa tampoco.
select throws_ok(
  $q$select public.approve_email_draft('a64499d1-7f43-4a43-abc8-41a313dc4018', '451c5e13-ab4e-47d4-a16f-d2ff95f6b5bc', 'c0000000-0000-4000-8000-0000000000c1', 'x', 'y')$q$,
  '23514', 'Quien aprueba no pertenece a la empresa o no tiene permiso para aprobar', 'un desconocido no puede aprobar');

-- El navegador no puede ejecutar la aprobación: solo el servidor.
set local role authenticated;
select throws_ok(
  $q$select public.approve_email_draft('a64499d1-7f43-4a43-abc8-41a313dc4018', '451c5e13-ab4e-47d4-a16f-d2ff95f6b5bc', '0c33590a-4c2a-4b32-a388-2008558688f7', 'x', 'y')$q$,
  '42501', null, 'authenticated no puede ejecutar approve_email_draft');
reset role;

-- Aprobar con el texto editado.
select public.approve_email_draft((select company_a from ids), (select approval from ids), (select marcos from ids), 'Asunto revisado', 'Cuerpo revisado por Marcos');

select is((select status::text from public.approvals where id = (select approval from ids)), 'approved', 'la aprobación queda aprobada');
select is((select decided_by from public.approvals where id = (select approval from ids)), (select marcos from ids), 'queda registrado quién aprobó');
select ok((select decided_at is not null from public.approvals where id = (select approval from ids)), 'queda registrado cuándo');
select is(
  (select content_sha256 from public.approvals where id = (select approval from ids)),
  public.email_content_hash('Asunto revisado', 'Cuerpo revisado por Marcos'),
  'la huella es la del texto exacto aprobado');
select is((select subject || '|' || body from public.emails where id = (select draft from ids)), 'Asunto revisado|Cuerpo revisado por Marcos', 'el borrador tiene el texto aprobado');

-- Una decisión es definitiva.
select throws_ok(
  $q$select public.approve_email_draft('a64499d1-7f43-4a43-abc8-41a313dc4018', '451c5e13-ab4e-47d4-a16f-d2ff95f6b5bc', '0c33590a-4c2a-4b32-a388-2008558688f7', 'otro', 'otro')$q$,
  '23514', 'La aprobación no existe o ya está resuelta', 'no se puede reaprobar con otro texto');

-- Si el texto cambia tras aprobarse, el envío se rechaza.
update public.emails set body = 'Cuerpo cambiado a escondidas' where id = (select draft from ids);
select throws_ok(
  $q$update public.emails set delivery_status = 'sent' where id = '456dac4a-404e-4a17-a757-f7b61a2f1621'$q$,
  '23514', 'El texto del correo no coincide con el aprobado', 'texto distinto al aprobado: no sale');
update public.emails set body = 'Cuerpo revisado por Marcos' where id = (select draft from ids);

-- Con el texto aprobado, la reserva del envío funciona y cuenta para el límite diario.
create temp table antes as select public.agent_emails_sent_today((select company_a from ids), (select agent_id from public.email_threads where id = (select thread_id from public.emails where id = (select draft from ids)))) as n;
-- (como hace el servidor al reservar el envío: la hora de envío es ahora)
update public.emails set delivery_status = 'sent', occurred_at = now() where id = (select draft from ids);
select is(
  public.agent_emails_sent_today((select company_a from ids), (select agent_id from public.email_threads where id = (select thread_id from public.emails where id = (select draft from ids)))),
  (select n from antes) + 1, 'el envío suma al límite diario del agente');

-- Estados de entrega: entregado y marcado como spam.
update public.emails set delivery_status = 'delivered' where id = (select draft from ids);
select is((select delivery_status::text from public.emails where id = (select draft from ids)), 'delivered', 'entregado');
update public.emails set delivery_status = 'complained' where id = (select draft from ids);
select is((select delivery_status::text from public.emails where id = (select draft from ids)), 'complained', 'marcado como spam');

select * from finish();
rollback;
