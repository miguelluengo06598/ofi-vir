-- Datos de ejemplo de la fase 2: la misma empresa y los mismos personajes ficticios que usa la interfaz.
-- Generado a partir de src/data/*.ts. Se carga con `supabase db reset`.
-- Usuario de desarrollo: marcos@hogarmediterraneo.example · contraseña: oficina-demo-2026 (solo para el entorno local).

-- Empresa y persona usuaria ------------------------------------------------------------
insert into public.companies (id, name) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'Hogar Mediterráneo, S.L.');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '0c33590a-4c2a-4b32-a388-2008558688f7', 'authenticated', 'authenticated', 'marcos@hogarmediterraneo.example', extensions.crypt('oficina-demo-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '0c33590a-4c2a-4b32-a388-2008558688f7', '0c33590a-4c2a-4b32-a388-2008558688f7', 'email', '{"sub":"0c33590a-4c2a-4b32-a388-2008558688f7","email":"marcos@hogarmediterraneo.example","email_verified":true}'::jsonb, now(), now(), now());
insert into public.users (id, company_id, full_name, email, role) values ('0c33590a-4c2a-4b32-a388-2008558688f7', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'Marcos Gil', 'marcos@hogarmediterraneo.example', 'owner');

-- Departamentos ---------------------------------------------------------------------
insert into public.departments (id, company_id, slug, name, tipo, orden) values
  ('36be8074-504e-4ef4-aa98-135ad3e9acb0', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'ventas', 'Ventas', 'ventas', 1),
  ('3bd58844-d48e-4d17-aa9b-d45d078a606a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'atencion', 'Atención al cliente', 'atencion', 2),
  ('acae02d0-24d4-4328-a496-3e3902b9df15', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'marketing', 'Marketing', 'marketing', 3),
  ('5a752a50-bda6-4141-ade2-7528ebf1fbe5', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'operaciones', 'Operaciones · CRM', 'operaciones', 4),
  ('4f29c0d7-984b-431f-ac67-990a0553389f', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'direccion', 'Dirección', 'direccion', 5);

-- Agentes ---------------------------------------------------------------------------
-- Nota: el enlace de estos agentes con sus plantillas (template_id) y la certificación de PRUEBA de las plantillas no están
-- aquí: las plantillas viven en src/lib/agentes/plantillas/ y las copia `npm run plantillas:sync -- --datos-de-prueba`
-- (lo hace `npm run db:reset` después del seed). Lucía Ramos → lucia-sdr, Sofía Navarro → sara-whatsapp, Nuria Campos → ivan-crm.
insert into public.agents (id, company_id, department_id, slug, name, role, creator_name, model, daily_email_limit, allowed_tools, status) values
  ('0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'lucia-ramos', 'Lucía Ramos', 'Seguimiento comercial', 'Estudio Cálamo', 'claude-haiku-5-5', 50, array['Gmail', 'HubSpot', 'Calendly'], 'working'),
  ('f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'daniel-prieto', 'Daniel Prieto', 'Cualificación de leads', 'Leadforge', 'claude-haiku-5-5', 50, array['HubSpot', 'LinkedIn', 'Google Sheets'], 'working'),
  ('dcd7cbec-7832-4214-a61e-866573d373ea', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'irene-soler', 'Irene Soler', 'Propuestas comerciales', 'Estudio Cálamo', 'claude-sonnet-5-5', 50, array['Google Docs', 'HubSpot', 'Stripe'], 'waiting'),
  ('426ade0b-f542-472b-aa70-3b385993a459', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3bd58844-d48e-4d17-aa9b-d45d078a606a', 'sofia-navarro', 'Sofía Navarro', 'Atención por chat', 'Helpdesk Labs', 'claude-haiku-5-5', 50, array['Intercom', 'Notion', 'Slack'], 'working'),
  ('cd7c9591-feec-41d3-a352-9ef34d41a1f2', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3bd58844-d48e-4d17-aa9b-d45d078a606a', 'hugo-lara', 'Hugo Lara', 'Atención por correo', 'Helpdesk Labs', 'claude-haiku-5-5', 50, array['Gmail', 'Zendesk'], 'working'),
  ('ccd5fab2-0b1d-4f27-a5ab-c52c0ee37542', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'acae02d0-24d4-4328-a496-3e3902b9df15', 'carla-medina', 'Carla Medina', 'Redactora de contenidos', 'Verbo Studio', 'claude-sonnet-5-5', 50, array['Notion', 'Mailchimp', 'Canva'], 'working'),
  ('a10039a1-1894-4397-a99c-1331d0db0e02', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'acae02d0-24d4-4328-a496-3e3902b9df15', 'alvaro-rios', 'Álvaro Ríos', 'Gestor de campañas', 'Verbo Studio', 'claude-sonnet-5-5', 50, array['Meta Ads', 'Google Ads', 'Google Analytics'], 'waiting'),
  ('ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '5a752a50-bda6-4141-ade2-7528ebf1fbe5', 'nuria-campos', 'Nuria Campos', 'Actualización de CRM', 'Flujo Ops', 'claude-haiku-5-5', 50, array['HubSpot', 'Google Sheets', 'Zapier'], 'working'),
  ('ba4ca42c-4868-4073-ad9f-44604088a4f5', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '5a752a50-bda6-4141-ade2-7528ebf1fbe5', 'tomas-vidal', 'Tomás Vidal', 'Facturación', 'Flujo Ops', 'claude-haiku-5-5', 50, array['Stripe', 'Holded', 'Gmail'], 'working'),
  ('e3aef07e-dd77-4d46-a7ec-d39405bdea41', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '4f29c0d7-984b-431f-ac67-990a0553389f', 'elena-bravo', 'Elena Bravo', 'Analista de dirección', 'Atalaya Analytics', 'claude-sonnet-5-5', 50, array['Google Analytics', 'Google Sheets', 'Slack'], 'working');

-- Contactos -------------------------------------------------------------------------
insert into public.contacts (id, company_id, name, email, organization, job_title) values
  ('3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'Laura Gómez', 'laura@clinicasol.example', 'Clínica Sol', 'Directora'),
  ('475a43fe-a454-4192-aa65-34dbdd28b35a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'Marta Ibáñez', 'marta@ibanezasociados.example', 'Ibáñez & Asociados', 'Socia'),
  ('7df1fdde-2d26-4774-a0a8-323b849c27f1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'Javier Ortega', 'javier@reformasortega.example', 'Reformas Ortega', 'Gerente');

-- Aprobaciones pendientes (las de la vista Aprobaciones) ------------------------------
insert into public.approvals (id, company_id, agent_id, kind, title, detail, payload, cost_credits, requested_at) values
  ('451c5e13-ab4e-47d4-a16f-d2ff95f6b5bc', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'dcd7cbec-7832-4214-a61e-866573d373ea', 'email', 'Enviar propuesta a Clínica Sol', 'Plan anual de gestión de citas · 4.200 € · válida 15 días', '{"to":"laura@clinicasol.example","to_name":"Laura Gómez","subject":"Propuesta: gestión de citas con IA para Clínica Sol","body":"Hola, Laura:\n\nGracias por tu respuesta. Entiendo que el precio te parece alto frente a la otra oferta que tenéis; por eso te adjunto la propuesta del plan anual con todo detallado, para que puedas compararlas punto por punto: recordatorios automáticos por WhatsApp, confirmación por correo y gestión de cancelaciones.\n\nLa inversión es de 4.200 € al año y la propuesta es válida durante 15 días. Si te encaja, podemos hablar el jueves por la tarde.\n\nUn saludo,\nIrene Soler · Ventas","attachments":[{"name":"Propuesta-Clinica-Sol.pdf","kind":"pdf","size":"412 KB"}]}'::jsonb, 1.8, ('2026-11-03 10:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('5f51ddb9-2e9d-4a79-aef1-c53a78aea27f', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '426ade0b-f542-472b-aa70-3b385993a459', 'email', 'Enviar el documento de seguridad a Ibáñez & Asociados', 'Responde a su objeción de protección de datos · 2 adjuntos', '{"to":"marta@ibanezasociados.example","to_name":"Marta Ibáñez","subject":"Protección de datos y secreto profesional: documento de seguridad","body":"Hola, Marta:\n\nTe adjunto el resumen de seguridad de nuestros agentes certificados: cómo se tratan y se cifran los datos, dónde se almacenan (Unión Europea) y qué garantías ofrecen para el RGPD y el secreto profesional. Ningún agente conserva datos de tus clientes fuera de tu oficina virtual.\n\nSi quieres, lo repasamos juntas en la demo.\n\nUn saludo,\nSofía Navarro · Atención al cliente","attachments":[{"name":"Seguridad-y-RGPD.pdf","kind":"pdf","size":"1,2 MB"},{"name":"Encargado-de-tratamiento.docx","kind":"doc","size":"86 KB"}]}'::jsonb, 0.9, ('2026-11-03 10:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('f0fa82c1-6262-4dd2-ac80-54a2f52b0ccb', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2', 'email', 'Responder a Reformas Ortega sobre el IVA', 'Aclara que el precio no incluye IVA y confirma el pago a 30 días', '{"to":"javier@reformasortega.example","to_name":"Javier Ortega","subject":"Re: Duda sobre el IVA y los plazos de pago","body":"Hola, Javier:\n\nEl precio del plan trimestral (2.800 €) no incluye IVA; se añade el 21 % en la factura. Sobre el pago: ya está acordada la transferencia a 30 días desde la fecha de factura, así que no tienes que hacer nada más.\n\nTe enviaremos la factura en el cierre de mes.\n\nUn saludo,\nHugo Lara · Atención al cliente","attachments":[]}'::jsonb, 0.4, ('2026-11-03 10:38:00'::timestamp at time zone 'Europe/Madrid')),
  ('2283de3d-25aa-44b6-a20f-18b3a44cdd3a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'a10039a1-1894-4397-a99c-1331d0db0e02', 'publish', 'Publicar el anuncio «Otoño en casa» en Meta Ads', 'Presupuesto de 350 € durante 7 días · público: Madrid y Valencia', '{"label":"Vista previa del anuncio","fields":[{"label":"Plataforma","value":"Meta Ads (Facebook e Instagram)"},{"label":"Titular","value":"Otoño en casa: renueva tu salón"},{"label":"Público","value":"Madrid y Valencia · 28–55 años"},{"label":"Presupuesto","value":"350 € en 7 días"}],"body":"Descubre la colección de otoño con envío gratis en pedidos de más de 60 €. Mantas, cojines y luz cálida para estrenar la estación."}'::jsonb, 4.5, ('2026-11-03 10:10:00'::timestamp at time zone 'Europe/Madrid')),
  ('9bdae1e2-dc15-48d2-a6ed-5d0340d773fb', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'a10039a1-1894-4397-a99c-1331d0db0e02', 'spend', 'Ampliar un 20 % el presupuesto de Google Ads', 'De 1.500 € a 1.800 € al mes · la campaña supera su objetivo de clics', '{"label":"Cambio propuesto","fields":[{"label":"Campaña","value":"Búsqueda · Otoño"},{"label":"Presupuesto mensual","value":"1.500 € → 1.800 € (+20 %)"},{"label":"Motivo","value":"Supera su objetivo de clics en un 18 %"}],"body":"Si apruebas, el nuevo presupuesto se aplica desde mañana y se revisa el viernes con los resultados de la semana."}'::jsonb, 0.6, ('2026-11-03 09:50:00'::timestamp at time zone 'Europe/Madrid')),
  ('cae8debc-6c76-415c-a5ea-31f93687c16c', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'a10039a1-1894-4397-a99c-1331d0db0e02', 'spend', 'Subir un 30 % el presupuesto de «Clínicas dentales – Madrid»', 'De 900 € a 1.170 € al mes · sus leads convierten el doble que la media', '{"label":"Cambio propuesto","fields":[{"label":"Campaña","value":"Clínicas dentales – Madrid"},{"label":"Presupuesto mensual","value":"900 € → 1.170 € (+30 %)"},{"label":"Motivo","value":"12 leads con buen perfil y una venta cerrada; convierten el doble que la media"}],"body":"Si apruebas, el nuevo presupuesto se aplica desde mañana y se revisa el viernes con los resultados de la semana."}'::jsonb, 0.8, ('2026-11-03 10:46:00'::timestamp at time zone 'Europe/Madrid'));

-- Aprobaciones históricas: una por cada correo ya enviado (sin ellas la base de datos no deja registrarlo) --
insert into public.approvals (id, company_id, agent_id, kind, title, detail, payload, requested_at) values
  ('f058b9f2-961b-4cfb-a96f-6f11d1bb3601', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'email', 'Enviar «Seguimiento del plan anual de gestión de citas»', 'Para Laura Gómez <laura@clinicasol.example>', '{"to":"laura@clinicasol.example","to_name":"Laura Gómez","subject":"Seguimiento del plan anual de gestión de citas","body":"Hola, Laura:\n\nTe escribo para retomar tu solicitud del otro día. El plan anual de gestión de citas permite que tu clínica confirme y recuerde las citas por WhatsApp sin que nadie del equipo tenga que hacerlo a mano.\n\nTe adjunto un resumen de una página. ¿Te va bien una llamada de 15 minutos esta semana, mejor por la tarde?\n\nUn saludo,\nLucía Ramos · Ventas","attachments":[{"name":"Resumen-plan-anual.pdf","kind":"pdf","size":"186 KB"}]}'::jsonb, ('2026-10-24 10:05:00'::timestamp at time zone 'Europe/Madrid') - interval '10 minutes'),
  ('d7c68487-3d39-4aa6-abd3-53c22259c55e', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'email', 'Enviar «Hemos recibido tu solicitud de información»', 'Para Laura Gómez <laura@clinicasol.example>', '{"to":"laura@clinicasol.example","to_name":"Laura Gómez","subject":"Hemos recibido tu solicitud de información","body":"Hola, Laura:\n\nHemos recibido tu solicitud desde el anuncio de clínicas dentales. En breve te escribiremos para contarte cómo podemos ayudar a Clínica Sol con la gestión de citas.\n\nUn saludo,\nLucía Ramos · Ventas","attachments":[]}'::jsonb, ('2026-10-21 09:40:00'::timestamp at time zone 'Europe/Madrid') - interval '10 minutes'),
  ('ecba000e-fe1a-4fac-a474-f9fe1db2a5a0', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'ba4ca42c-4868-4073-ad9f-44604088a4f5', 'email', 'Enviar «Factura del plan trimestral (2.800 €)»', 'Para Javier Ortega <javier@reformasortega.example>', '{"to":"javier@reformasortega.example","to_name":"Javier Ortega","subject":"Factura del plan trimestral (2.800 €)","body":"Hola, Javier:\n\nAdjunto la factura del plan trimestral contratado el 28 de octubre. El pago se hace por transferencia a 30 días desde la fecha de factura.\n\nUn saludo,\nTomás Vidal · Operaciones","attachments":[{"name":"Factura-2026-0214.pdf","kind":"pdf","size":"98 KB"}]}'::jsonb, ('2026-10-31 12:30:00'::timestamp at time zone 'Europe/Madrid') - interval '10 minutes'),
  ('737b5cc0-009d-4cb9-aef2-2f0fde435237', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'dcd7cbec-7832-4214-a61e-866573d373ea', 'email', 'Enviar «Propuesta del plan trimestral para Reformas Ortega»', 'Para Javier Ortega <javier@reformasortega.example>', '{"to":"javier@reformasortega.example","to_name":"Javier Ortega","subject":"Propuesta del plan trimestral para Reformas Ortega","body":"Hola, Javier:\n\nGracias por suscribirte al boletín y por tu interés. Te adjunto la propuesta del plan trimestral (2.800 €) con el calendario de pagos y lo que incluye cada mes.\n\nUn saludo,\nIrene Soler · Ventas","attachments":[{"name":"Propuesta-Reformas-Ortega.pdf","kind":"pdf","size":"354 KB"},{"name":"Presupuesto-trimestral.xlsx","kind":"sheet","size":"41 KB"}]}'::jsonb, ('2026-10-16 09:30:00'::timestamp at time zone 'Europe/Madrid') - interval '10 minutes'),
  ('29b96d1f-ced7-484d-ab35-c15416ddb51a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'email', 'Enviar «Invitación a una demo de 20 minutos»', 'Para Marta Ibáñez <marta@ibanezasociados.example>', '{"to":"marta@ibanezasociados.example","to_name":"Marta Ibáñez","subject":"Invitación a una demo de 20 minutos","body":"Hola, Marta:\n\nTe propongo una demo de 20 minutos para enseñarte cómo atiende un agente las primeras consultas de tu despacho. Tengo libre el jueves a las 10:00, el viernes a las 12:30 o el lunes a las 16:00.\n\nUn saludo,\nLucía Ramos · Ventas","attachments":[]}'::jsonb, ('2026-10-30 09:00:00'::timestamp at time zone 'Europe/Madrid') - interval '10 minutes'),
  ('baa8bb3b-4879-4271-a4f1-3c115a2ba0d7', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'email', 'Enviar «Hemos recibido tu solicitud de demo»', 'Para Marta Ibáñez <marta@ibanezasociados.example>', '{"to":"marta@ibanezasociados.example","to_name":"Marta Ibáñez","subject":"Hemos recibido tu solicitud de demo","body":"Hola, Marta:\n\nHemos recibido tu solicitud de demo para Ibáñez & Asociados. Te escribiremos pronto con varias opciones de horario.\n\nUn saludo,\nLucía Ramos · Ventas","attachments":[]}'::jsonb, ('2026-10-29 15:45:00'::timestamp at time zone 'Europe/Madrid') - interval '10 minutes');
update public.approvals set status = 'approved', decided_by = '0c33590a-4c2a-4b32-a388-2008558688f7', decided_at = requested_at + interval '5 minutes'
 where id in ('f058b9f2-961b-4cfb-a96f-6f11d1bb3601', 'd7c68487-3d39-4aa6-abd3-53c22259c55e', 'ecba000e-fe1a-4fac-a474-f9fe1db2a5a0', '737b5cc0-009d-4cb9-aef2-2f0fde435237', '29b96d1f-ced7-484d-ab35-c15416ddb51a', 'baa8bb3b-4879-4271-a4f1-3c115a2ba0d7');

-- Hilos y correos --------------------------------------------------------------------
insert into public.email_threads (id, company_id, contact_id, agent_id, subject, status, status_note, last_message_at, created_at) values
  ('1c515d8c-b062-4bac-afa4-8583e5a465ce', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'dcd7cbec-7832-4214-a61e-866573d373ea', 'Propuesta: gestión de citas con IA para Clínica Sol', 'pending_approval', null, ('2026-11-03 10:15:00'::timestamp at time zone 'Europe/Madrid'), ('2026-11-03 10:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('15ca690e-88ee-40fe-a7d9-777b3ef586c2', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'Seguimiento del plan anual de gestión de citas', 'replied', null, ('2026-10-27 16:40:00'::timestamp at time zone 'Europe/Madrid'), ('2026-10-24 10:05:00'::timestamp at time zone 'Europe/Madrid')),
  ('3be97a52-ef83-4918-aa60-b84258ec955f', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'Hemos recibido tu solicitud de información', 'delivered', null, ('2026-10-21 09:40:00'::timestamp at time zone 'Europe/Madrid'), ('2026-10-21 09:40:00'::timestamp at time zone 'Europe/Madrid')),
  ('e97505ec-d845-4f1e-a5ff-08ca2674f1ef', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2', 'Re: Duda sobre el IVA y los plazos de pago', 'pending_approval', null, ('2026-11-03 10:40:00'::timestamp at time zone 'Europe/Madrid'), ('2026-10-30 17:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('57ebeff2-0956-4492-a699-0827bd832ed4', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'ba4ca42c-4868-4073-ad9f-44604088a4f5', 'Factura del plan trimestral (2.800 €)', 'bounced', 'El servidor de destino rechazó el correo: el buzón está lleno. Tomás lo reintentará mañana.', ('2026-10-31 12:30:00'::timestamp at time zone 'Europe/Madrid'), ('2026-10-31 12:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('b590a700-c43a-447f-a9e7-ccaa8ecb9dc7', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'dcd7cbec-7832-4214-a61e-866573d373ea', 'Propuesta del plan trimestral para Reformas Ortega', 'replied', null, ('2026-10-28 11:10:00'::timestamp at time zone 'Europe/Madrid'), ('2026-10-16 09:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('64ee2cb3-0d27-426f-a9fb-dd092d74cd01', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', '426ade0b-f542-472b-aa70-3b385993a459', 'Protección de datos y secreto profesional: documento de seguridad', 'pending_approval', null, ('2026-11-03 10:50:00'::timestamp at time zone 'Europe/Madrid'), ('2026-11-03 10:50:00'::timestamp at time zone 'Europe/Madrid')),
  ('c36c4e2e-6f5a-4e2e-a178-79cf2d154454', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'Invitación a una demo de 20 minutos', 'replied', null, ('2026-11-02 13:15:00'::timestamp at time zone 'Europe/Madrid'), ('2026-10-30 09:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('3168afc8-a95e-4491-a8d3-8033c3f85403', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'Hemos recibido tu solicitud de demo', 'delivered', null, ('2026-10-29 15:45:00'::timestamp at time zone 'Europe/Madrid'), ('2026-10-29 15:45:00'::timestamp at time zone 'Europe/Madrid'));
insert into public.emails (id, company_id, thread_id, direction, from_address, to_address, subject, body, attachments, delivery_status, approval_id, resend_message_id, message_id_header, in_reply_to, references_headers, occurred_at) values
  ('456dac4a-404e-4a17-a757-f7b61a2f1621', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '1c515d8c-b062-4bac-afa4-8583e5a465ce', 'outbound', 'irene-soler@agentes.hogarmediterraneo.example', 'laura@clinicasol.example', 'Propuesta: gestión de citas con IA para Clínica Sol', 'Hola, Laura:

Gracias por tu respuesta. Entiendo que el precio te parece alto frente a la otra oferta que tenéis; por eso te adjunto la propuesta del plan anual con todo detallado, para que puedas compararlas punto por punto: recordatorios automáticos por WhatsApp, confirmación por correo y gestión de cancelaciones.

La inversión es de 4.200 € al año y la propuesta es válida durante 15 días. Si te encaja, podemos hablar el jueves por la tarde.

Un saludo,
Irene Soler · Ventas', '[{"name":"Propuesta-Clinica-Sol.pdf","kind":"pdf","size":"412 KB"}]'::jsonb, 'pending_approval', '451c5e13-ab4e-47d4-a16f-d2ff95f6b5bc', null, '<456dac4a-404e-4a17-a757-f7b61a2f1621@agentes.hogarmediterraneo.example>', null, '{}'::text[], ('2026-11-03 10:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('b3c34a61-4499-4174-a222-980109c9d46c', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '15ca690e-88ee-40fe-a7d9-777b3ef586c2', 'outbound', 'lucia-ramos@agentes.hogarmediterraneo.example', 'laura@clinicasol.example', 'Seguimiento del plan anual de gestión de citas', 'Hola, Laura:

Te escribo para retomar tu solicitud del otro día. El plan anual de gestión de citas permite que tu clínica confirme y recuerde las citas por WhatsApp sin que nadie del equipo tenga que hacerlo a mano.

Te adjunto un resumen de una página. ¿Te va bien una llamada de 15 minutos esta semana, mejor por la tarde?

Un saludo,
Lucía Ramos · Ventas', '[{"name":"Resumen-plan-anual.pdf","kind":"pdf","size":"186 KB"}]'::jsonb, 'delivered', 'f058b9f2-961b-4cfb-a96f-6f11d1bb3601', 're_b3c34a6144994174a2229801', '<b3c34a61-4499-4174-a222-980109c9d46c@agentes.hogarmediterraneo.example>', null, '{}'::text[], ('2026-10-24 10:05:00'::timestamp at time zone 'Europe/Madrid')),
  ('1c3c7c1a-3bb0-4dd4-a286-fde1eb684140', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '15ca690e-88ee-40fe-a7d9-777b3ef586c2', 'inbound', 'laura@clinicasol.example', 'lucia-ramos@agentes.hogarmediterraneo.example', 'Re: Seguimiento del plan anual de gestión de citas', 'Hola, Lucía:

Gracias por el resumen. Nos interesa, pero el precio nos parece alto comparado con la oferta que ya tenemos sobre la mesa. ¿Hay margen?

Laura', '[]'::jsonb, 'received', null, null, '<1c3c7c1a-3bb0-4dd4-a286-fde1eb684140@agentes.hogarmediterraneo.example>', '<b3c34a61-4499-4174-a222-980109c9d46c@agentes.hogarmediterraneo.example>', array['<b3c34a61-4499-4174-a222-980109c9d46c@agentes.hogarmediterraneo.example>'], ('2026-10-27 16:40:00'::timestamp at time zone 'Europe/Madrid')),
  ('68812773-8871-4530-a776-ba34833b2f77', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3be97a52-ef83-4918-aa60-b84258ec955f', 'outbound', 'lucia-ramos@agentes.hogarmediterraneo.example', 'laura@clinicasol.example', 'Hemos recibido tu solicitud de información', 'Hola, Laura:

Hemos recibido tu solicitud desde el anuncio de clínicas dentales. En breve te escribiremos para contarte cómo podemos ayudar a Clínica Sol con la gestión de citas.

Un saludo,
Lucía Ramos · Ventas', '[]'::jsonb, 'delivered', 'd7c68487-3d39-4aa6-abd3-53c22259c55e', 're_6881277388714530a776ba34', '<68812773-8871-4530-a776-ba34833b2f77@agentes.hogarmediterraneo.example>', null, '{}'::text[], ('2026-10-21 09:40:00'::timestamp at time zone 'Europe/Madrid')),
  ('d33c69f7-29cd-4cf1-ae44-395408ca6eed', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'e97505ec-d845-4f1e-a5ff-08ca2674f1ef', 'inbound', 'javier@reformasortega.example', 'hugo-lara@agentes.hogarmediterraneo.example', 'Re: ', 'Buenas tardes:

¿El precio de 2.800 € incluye el IVA? Y ¿podemos pagar por transferencia a 30 días como hablamos?

Javier Ortega', '[]'::jsonb, 'received', null, null, '<d33c69f7-29cd-4cf1-ae44-395408ca6eed@agentes.hogarmediterraneo.example>', null, '{}'::text[], ('2026-10-30 17:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('7aac19a0-fe35-49dd-a4a7-1e1ba3703e48', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'e97505ec-d845-4f1e-a5ff-08ca2674f1ef', 'outbound', 'hugo-lara@agentes.hogarmediterraneo.example', 'javier@reformasortega.example', 'Re: Duda sobre el IVA y los plazos de pago', 'Hola, Javier:

El precio del plan trimestral (2.800 €) no incluye IVA; se añade el 21 % en la factura. Sobre el pago: ya está acordada la transferencia a 30 días desde la fecha de factura, así que no tienes que hacer nada más.

Te enviaremos la factura en el cierre de mes.

Un saludo,
Hugo Lara · Atención al cliente', '[]'::jsonb, 'pending_approval', 'f0fa82c1-6262-4dd2-ac80-54a2f52b0ccb', null, '<7aac19a0-fe35-49dd-a4a7-1e1ba3703e48@agentes.hogarmediterraneo.example>', '<d33c69f7-29cd-4cf1-ae44-395408ca6eed@agentes.hogarmediterraneo.example>', array['<d33c69f7-29cd-4cf1-ae44-395408ca6eed@agentes.hogarmediterraneo.example>'], ('2026-11-03 10:40:00'::timestamp at time zone 'Europe/Madrid')),
  ('11f35250-64a9-48bd-a098-5fac56fabc8a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '57ebeff2-0956-4492-a699-0827bd832ed4', 'outbound', 'tomas-vidal@agentes.hogarmediterraneo.example', 'javier@reformasortega.example', 'Factura del plan trimestral (2.800 €)', 'Hola, Javier:

Adjunto la factura del plan trimestral contratado el 28 de octubre. El pago se hace por transferencia a 30 días desde la fecha de factura.

Un saludo,
Tomás Vidal · Operaciones', '[{"name":"Factura-2026-0214.pdf","kind":"pdf","size":"98 KB"}]'::jsonb, 'bounced', 'ecba000e-fe1a-4fac-a474-f9fe1db2a5a0', 're_11f3525064a948bda0985fac', '<11f35250-64a9-48bd-a098-5fac56fabc8a@agentes.hogarmediterraneo.example>', null, '{}'::text[], ('2026-10-31 12:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('508bfba6-5b63-412b-aac4-1ff1725fc7e5', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'b590a700-c43a-447f-a9e7-ccaa8ecb9dc7', 'outbound', 'irene-soler@agentes.hogarmediterraneo.example', 'javier@reformasortega.example', 'Propuesta del plan trimestral para Reformas Ortega', 'Hola, Javier:

Gracias por suscribirte al boletín y por tu interés. Te adjunto la propuesta del plan trimestral (2.800 €) con el calendario de pagos y lo que incluye cada mes.

Un saludo,
Irene Soler · Ventas', '[{"name":"Propuesta-Reformas-Ortega.pdf","kind":"pdf","size":"354 KB"},{"name":"Presupuesto-trimestral.xlsx","kind":"sheet","size":"41 KB"}]'::jsonb, 'delivered', '737b5cc0-009d-4cb9-aef2-2f0fde435237', 're_508bfba65b63412baac41ff1', '<508bfba6-5b63-412b-aac4-1ff1725fc7e5@agentes.hogarmediterraneo.example>', null, '{}'::text[], ('2026-10-16 09:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('c46bf0db-c376-4f1e-ae59-203099687262', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'b590a700-c43a-447f-a9e7-ccaa8ecb9dc7', 'inbound', 'javier@reformasortega.example', 'irene-soler@agentes.hogarmediterraneo.example', 'Re: Propuesta del plan trimestral para Reformas Ortega', 'Hola, Irene:

Lo hemos revisado y aceptamos la propuesta. Os devuelvo firmada la hoja de condiciones.

Un saludo,
Javier', '[{"name":"Condiciones-firmadas.pdf","kind":"pdf","size":"220 KB"}]'::jsonb, 'received', null, null, '<c46bf0db-c376-4f1e-ae59-203099687262@agentes.hogarmediterraneo.example>', '<508bfba6-5b63-412b-aac4-1ff1725fc7e5@agentes.hogarmediterraneo.example>', array['<508bfba6-5b63-412b-aac4-1ff1725fc7e5@agentes.hogarmediterraneo.example>'], ('2026-10-28 11:10:00'::timestamp at time zone 'Europe/Madrid')),
  ('79718621-a364-45e3-aa76-60a88124ebd6', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '64ee2cb3-0d27-426f-a9fb-dd092d74cd01', 'outbound', 'sofia-navarro@agentes.hogarmediterraneo.example', 'marta@ibanezasociados.example', 'Protección de datos y secreto profesional: documento de seguridad', 'Hola, Marta:

Te adjunto el resumen de seguridad de nuestros agentes certificados: cómo se tratan y se cifran los datos, dónde se almacenan (Unión Europea) y qué garantías ofrecen para el RGPD y el secreto profesional. Ningún agente conserva datos de tus clientes fuera de tu oficina virtual.

Si quieres, lo repasamos juntas en la demo.

Un saludo,
Sofía Navarro · Atención al cliente', '[{"name":"Seguridad-y-RGPD.pdf","kind":"pdf","size":"1,2 MB"},{"name":"Encargado-de-tratamiento.docx","kind":"doc","size":"86 KB"}]'::jsonb, 'pending_approval', '5f51ddb9-2e9d-4a79-aef1-c53a78aea27f', null, '<79718621-a364-45e3-aa76-60a88124ebd6@agentes.hogarmediterraneo.example>', null, '{}'::text[], ('2026-11-03 10:50:00'::timestamp at time zone 'Europe/Madrid')),
  ('e1b7bf2f-6c57-4cbd-af94-5d0adeb1e5ed', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'c36c4e2e-6f5a-4e2e-a178-79cf2d154454', 'outbound', 'lucia-ramos@agentes.hogarmediterraneo.example', 'marta@ibanezasociados.example', 'Invitación a una demo de 20 minutos', 'Hola, Marta:

Te propongo una demo de 20 minutos para enseñarte cómo atiende un agente las primeras consultas de tu despacho. Tengo libre el jueves a las 10:00, el viernes a las 12:30 o el lunes a las 16:00.

Un saludo,
Lucía Ramos · Ventas', '[]'::jsonb, 'delivered', '29b96d1f-ced7-484d-ab35-c15416ddb51a', 're_e1b7bf2f6c574cbdaf945d0a', '<e1b7bf2f-6c57-4cbd-af94-5d0adeb1e5ed@agentes.hogarmediterraneo.example>', null, '{}'::text[], ('2026-10-30 09:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('6ae6352a-deb2-418d-ac15-c1a5dd94c54e', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'c36c4e2e-6f5a-4e2e-a178-79cf2d154454', 'inbound', 'marta@ibanezasociados.example', 'lucia-ramos@agentes.hogarmediterraneo.example', 'Re: Invitación a una demo de 20 minutos', 'Hola, Lucía:

Me interesa, pero antes necesito saber cómo se protegen los datos de nuestros clientes y si se respeta el secreto profesional.

Marta Ibáñez', '[]'::jsonb, 'received', null, null, '<6ae6352a-deb2-418d-ac15-c1a5dd94c54e@agentes.hogarmediterraneo.example>', '<e1b7bf2f-6c57-4cbd-af94-5d0adeb1e5ed@agentes.hogarmediterraneo.example>', array['<e1b7bf2f-6c57-4cbd-af94-5d0adeb1e5ed@agentes.hogarmediterraneo.example>'], ('2026-11-02 13:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('47387bce-8b9d-4bda-a8f5-465b4661c42c', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3168afc8-a95e-4491-a8d3-8033c3f85403', 'outbound', 'lucia-ramos@agentes.hogarmediterraneo.example', 'marta@ibanezasociados.example', 'Hemos recibido tu solicitud de demo', 'Hola, Marta:

Hemos recibido tu solicitud de demo para Ibáñez & Asociados. Te escribiremos pronto con varias opciones de horario.

Un saludo,
Lucía Ramos · Ventas', '[]'::jsonb, 'delivered', 'baa8bb3b-4879-4271-a4f1-3c115a2ba0d7', 're_47387bce8b9d4bdaa8f5465b', '<47387bce-8b9d-4bda-a8f5-465b4661c42c@agentes.hogarmediterraneo.example>', null, '{}'::text[], ('2026-10-29 15:45:00'::timestamp at time zone 'Europe/Madrid'));

-- Tareas ----------------------------------------------------------------------------
insert into public.tasks (id, company_id, agent_id, title, status, model, input_tokens, output_tokens, creator_fee_credits, started_at, finished_at) values
  ('dde6f39a-9842-47b9-ad32-19911b0383e0', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'Enviando seguimientos a 14 leads', 'running', 'claude-haiku-5-5', 23306, 6262, 0, ('2026-11-03 09:10:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('552cfbc2-8225-461b-a8fe-8b8c45fcb489', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 'Puntuando 23 contactos nuevos del formulario web', 'running', 'claude-haiku-5-5', 20818, 5486, 0, ('2026-11-03 09:14:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('618e509a-188f-43c2-a1b7-b3d2360ea281', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'dcd7cbec-7832-4214-a61e-866573d373ea', 'Esperando tu aprobación para enviar una propuesta de 4.200 €', 'approval', 'claude-sonnet-5-5', 18019, 4613, 0, ('2026-11-03 09:18:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('7f5077c6-2859-449e-afee-5308500249e8', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '426ade0b-f542-472b-aa70-3b385993a459', 'Respondiendo 9 conversaciones abiertas en el chat web', 'running', 'claude-haiku-5-5', 27971, 2717, 0, ('2026-11-03 09:22:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('82a4cedd-1b63-460d-a6f4-e5905539ebbd', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2', 'Clasificando 31 correos del buzón de soporte', 'running', 'claude-haiku-5-5', 19263, 5001, 0, ('2026-11-03 09:26:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('ecd4203f-9887-4dba-a744-322ac170e4c8', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'ccd5fab2-0b1d-4f27-a5ab-c52c0ee37542', 'Redactando el boletín de noviembre', 'running', 'claude-sonnet-5-5', 25172, 1844, 0, ('2026-11-03 09:30:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('bae8be7d-343a-409a-a9c6-aac0e3f650e3', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'a10039a1-1894-4397-a99c-1331d0db0e02', 'Esperando tu aprobación para 3 cambios en sus campañas', 'approval', 'claude-sonnet-5-5', 22684, 6068, 0, ('2026-11-03 09:34:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('bd73f7dd-2ea5-4f92-abe3-f40b1f7dd60b', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', 'Actualizando 120 fichas de clientes en el CRM', 'running', 'claude-haiku-5-5', 17397, 4419, 0, ('2026-11-03 09:38:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('29104a37-145b-473b-ac23-ecb6e5a65686', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'ba4ca42c-4868-4073-ad9f-44604088a4f5', 'Emitiendo 6 facturas del cierre de mes', 'running', 'claude-haiku-5-5', 19885, 5195, 0, ('2026-11-03 09:42:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('ba23f8be-d3f1-4545-a989-65447d13e4b9', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'e3aef07e-dd77-4d46-a7ec-d39405bdea41', 'Preparando el informe semanal de ventas y gasto', 'running', 'claude-sonnet-5-5', 14598, 3546, 0, ('2026-11-03 09:46:00'::timestamp at time zone 'Europe/Madrid'), null),
  ('3fe3ae06-0200-408c-ad6d-aacc639ef1a9', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'dcd7cbec-7832-4214-a61e-866573d373ea', 'Propuesta para Clínica Sol', 'done', 'claude-sonnet-5-5', 41000, 9600, 3.1, ('2026-11-02 16:30:00'::timestamp at time zone 'Europe/Madrid'), ('2026-11-02 17:10:00'::timestamp at time zone 'Europe/Madrid')),
  ('d0bdafc8-b159-48a7-af6b-c4d92103c207', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'Seguimiento a 9 leads del webinar', 'done', 'claude-haiku-5-5', 22000, 4100, 1.4, ('2026-11-03 09:12:00'::timestamp at time zone 'Europe/Madrid'), ('2026-11-03 09:48:00'::timestamp at time zone 'Europe/Madrid')),
  ('7c7343e7-7e65-413b-a541-7738392fdd6d', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'ba4ca42c-4868-4073-ad9f-44604088a4f5', 'Factura del plan trimestral de Reformas Ortega', 'done', 'claude-haiku-5-5', 8200, 1100, 0.9, ('2026-10-31 12:20:00'::timestamp at time zone 'Europe/Madrid'), ('2026-10-31 12:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('c579a8ff-25b3-4c48-a57a-2ca37ba5b772', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'e3aef07e-dd77-4d46-a7ec-d39405bdea41', 'Informe semanal de ventas y gasto', 'done', 'claude-sonnet-5-5', 64000, 12500, 4, ('2026-11-02 08:30:00'::timestamp at time zone 'Europe/Madrid'), ('2026-11-02 09:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('d1792134-e22b-4b75-ac3c-a6d5872dd2ef', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2', 'Clasificar 31 correos del buzón de soporte', 'done', 'claude-haiku-5-5', 31000, 2800, 0.6, ('2026-11-03 08:40:00'::timestamp at time zone 'Europe/Madrid'), ('2026-11-03 09:05:00'::timestamp at time zone 'Europe/Madrid'));

-- Traspasos entre departamentos --------------------------------------------------------
insert into public.handoff_chains (id, company_id, title, goal) values
  ('cb7333d4-dc5d-46fb-a655-a43e466daa90', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'De un anuncio a una venta', 'Convertir los leads de la campaña «Clínicas dentales – Madrid» en clientes y decidir si merece más presupuesto.'),
  ('291d6785-9e10-46b2-adde-97873a3a93a0', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'Cobro duplicado resuelto', 'Corregir un cobro duplicado reclamado por una clienta y evitar que se repita.'),
  ('692bc6e7-0b43-40b4-ab0e-fadc6827d52c', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'Del boletín a nuevas oportunidades', 'Aprovechar las respuestas al boletín de octubre para generar oportunidades de venta.');
insert into public.handoffs (id, company_id, chain_id, position, from_agent_id, to_agent_id, from_department_id, to_department_id, kind, summary, bubble, card, status, credits, approval_id, occurred_at) values
  ('e9577751-9904-4486-aff9-56f7ebc42e65', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cb7333d4-dc5d-46fb-a655-a43e466daa90', 0, 'a10039a1-1894-4397-a99c-1331d0db0e02', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'acae02d0-24d4-4328-a496-3e3902b9df15', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'lead', '12 leads con buen perfil de la campaña «Clínicas dentales – Madrid»', 'Lucía recibió 12 leads de Álvaro', '[{"label":"Campaña","value":"Clínicas dentales – Madrid (Meta Ads)"},{"label":"Leads","value":"12 con buen perfil (clínicas de 2 a 6 sillones)"},{"label":"Coste por lead","value":"7,40 €"},{"label":"Interés declarado","value":"Gestión de citas y recordatorios por WhatsApp"}]'::jsonb, 'done', 0.9, null, ('2026-11-03 09:05:00'::timestamp at time zone 'Europe/Madrid')),
  ('96d22838-227b-4aae-a6a4-4d373808dfc8', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cb7333d4-dc5d-46fb-a655-a43e466daa90', 1, '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', '426ade0b-f542-472b-aa70-3b385993a459', '36be8074-504e-4ef4-aa98-135ad3e9acb0', '3bd58844-d48e-4d17-aa9b-d45d078a606a', 'peticion', 'Atender por WhatsApp las respuestas de los leads contactados', 'Sofía recibió una petición de Lucía', '[{"label":"Primer mensaje enviado","value":"«Hola, vimos que te interesó el anuncio sobre gestión de citas. ¿Te cuento cómo lo usan otras clínicas de Madrid?»"},{"label":"Canal","value":"WhatsApp Business"},{"label":"Leads contactados","value":"12"}]'::jsonb, 'done', 1.2, null, ('2026-11-03 09:40:00'::timestamp at time zone 'Europe/Madrid')),
  ('e5d6ac01-3953-4a39-a8c7-75a62fe43e76', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cb7333d4-dc5d-46fb-a655-a43e466daa90', 2, '426ade0b-f542-472b-aa70-3b385993a459', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', '3bd58844-d48e-4d17-aa9b-d45d078a606a', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'lead', 'Un lead pregunta precios: conversación resumida para Ventas', 'Lucía recibió un lead de Sofía', '[{"label":"Contacto","value":"Clínica Sol · Laura Gómez"},{"label":"Resumen","value":"Pregunta por el precio del plan anual y si hay permanencia. Tiene 4 sillones y 2 recepcionistas."},{"label":"Siguiente paso","value":"Enviar propuesta y proponer llamada el jueves"}]'::jsonb, 'done', 0.7, null, ('2026-11-03 10:12:00'::timestamp at time zone 'Europe/Madrid')),
  ('a666e351-6cdf-4a4e-aeeb-63b6e9db373a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cb7333d4-dc5d-46fb-a655-a43e466daa90', 3, '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', '36be8074-504e-4ef4-aa98-135ad3e9acb0', '5a752a50-bda6-4141-ade2-7528ebf1fbe5', 'peticion', 'Actualizar en el CRM las 12 fichas con el primer contacto', 'Nuria recibió una petición de Lucía', '[{"label":"Fichas","value":"12 (estado: contactado; 1 en negociación)"},{"label":"Etiqueta","value":"Campaña · Clínicas dentales – Madrid"},{"label":"Notas","value":"Añadir resumen de la conversación de WhatsApp en Laura Gómez"}]'::jsonb, 'done', 0.6, null, ('2026-11-03 10:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('3801674a-f5a4-4966-ad73-0a33732b03e5', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cb7333d4-dc5d-46fb-a655-a43e466daa90', 4, '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 'a10039a1-1894-4397-a99c-1331d0db0e02', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'acae02d0-24d4-4328-a496-3e3902b9df15', 'informe', 'Venta cerrada: los leads de esta campaña convierten el doble que la media', 'Álvaro recibió el informe de Lucía', '[{"label":"Venta","value":"Clínica Sol · plan anual · 4.200 €"},{"label":"Conversión de la campaña","value":"16 % frente al 8 % de media"},{"label":"Tiempo hasta el cierre","value":"5 días"}]'::jsonb, 'done', 0.5, null, ('2026-11-03 11:48:00'::timestamp at time zone 'Europe/Madrid')),
  ('8a41cd73-4917-4428-a099-79e1d662b28e', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cb7333d4-dc5d-46fb-a655-a43e466daa90', 5, 'a10039a1-1894-4397-a99c-1331d0db0e02', 'e3aef07e-dd77-4d46-a7ec-d39405bdea41', 'acae02d0-24d4-4328-a496-3e3902b9df15', '4f29c0d7-984b-431f-ac67-990a0553389f', 'peticion', 'Propone subir un 30 % el presupuesto de la campaña (requiere tu aprobación)', 'Elena recibió una propuesta de Álvaro', '[{"label":"Cambio","value":"900 € → 1.170 € al mes (+30 %)"},{"label":"Motivo","value":"Conversión doble que la media y coste por lead estable"},{"label":"Riesgo","value":"Bajo: se revisa el viernes con los resultados"}]'::jsonb, 'in_progress', 0.8, 'cae8debc-6c76-415c-a5ea-31f93687c16c', ('2026-11-03 12:02:00'::timestamp at time zone 'Europe/Madrid')),
  ('bb12f78f-3bdf-4b1f-a490-e0a6c3453512', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'cb7333d4-dc5d-46fb-a655-a43e466daa90', 6, 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', 'e3aef07e-dd77-4d46-a7ec-d39405bdea41', '5a752a50-bda6-4141-ade2-7528ebf1fbe5', '4f29c0d7-984b-431f-ac67-990a0553389f', 'informe', 'Resumen de la cadena para el informe semanal', 'Elena recibió el resumen de la cadena', '[{"label":"Cadena","value":"De un anuncio a una venta"},{"label":"Resultado","value":"12 leads · 1 venta de 4.200 € · coste total de la cadena 5,0 créditos"},{"label":"Destino","value":"Informe semanal de dirección"}]'::jsonb, 'received', 0.3, null, ('2026-11-03 12:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('d3029bf5-fbcd-4d74-a9d0-b02e305fff6e', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '291d6785-9e10-46b2-adde-97873a3a93a0', 0, '426ade0b-f542-472b-aa70-3b385993a459', 'ba4ca42c-4868-4073-ad9f-44604088a4f5', '3bd58844-d48e-4d17-aa9b-d45d078a606a', '5a752a50-bda6-4141-ade2-7528ebf1fbe5', 'peticion', 'Revisar un cobro duplicado de 89 € a una clienta del plan Pro', 'Tomás recibió una petición de Sofía', '[{"label":"Cliente","value":"Marta Olmos · plan Pro"},{"label":"Importe","value":"89 € cobrados dos veces el 28/10"},{"label":"Canal","value":"Chat web"}]'::jsonb, 'done', 0.6, null, ('2026-11-03 10:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('d20b6b71-dca1-4f77-a529-065a1a0870c1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '291d6785-9e10-46b2-adde-97873a3a93a0', 1, 'ba4ca42c-4868-4073-ad9f-44604088a4f5', '426ade0b-f542-472b-aa70-3b385993a459', '5a752a50-bda6-4141-ade2-7528ebf1fbe5', '3bd58844-d48e-4d17-aa9b-d45d078a606a', 'aviso', 'Reembolso de 89 € emitido; la clienta lo verá en 3-5 días', 'Sofía recibió un aviso de Tomás', '[{"label":"Reembolso","value":"89 € a la tarjeta original"},{"label":"Causa","value":"Reintento automático de la pasarela"},{"label":"Plazo","value":"3-5 días laborables"}]'::jsonb, 'done', 0.4, null, ('2026-11-03 10:44:00'::timestamp at time zone 'Europe/Madrid')),
  ('8309049a-b5ab-497a-a1fb-ddb740f17fbd', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '291d6785-9e10-46b2-adde-97873a3a93a0', 2, '426ade0b-f542-472b-aa70-3b385993a459', 'e3aef07e-dd77-4d46-a7ec-d39405bdea41', '3bd58844-d48e-4d17-aa9b-d45d078a606a', '4f29c0d7-984b-431f-ac67-990a0553389f', 'informe', 'Segunda reclamación de facturación esta semana', 'Elena recibió un informe de Sofía', '[{"label":"Reclamaciones","value":"2 esta semana (ambas por cobros duplicados)"},{"label":"Importe devuelto","value":"178 €"},{"label":"Recomendación","value":"Revisar los reintentos de la pasarela de pago"}]'::jsonb, 'received', 0.3, null, ('2026-11-03 11:05:00'::timestamp at time zone 'Europe/Madrid')),
  ('c0412d49-97e5-4a61-abb9-bcdb82ba7e66', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '692bc6e7-0b43-40b4-ab0e-fadc6827d52c', 0, 'ccd5fab2-0b1d-4f27-a5ab-c52c0ee37542', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 'acae02d0-24d4-4328-a496-3e3902b9df15', '36be8074-504e-4ef4-aa98-135ad3e9acb0', 'aviso', '8 suscriptores del boletín han pedido una demo', 'Daniel recibió un aviso de Carla', '[{"label":"Origen","value":"Boletín de octubre · botón «Pide una demo»"},{"label":"Contactos","value":"8 (3 con empresa de más de 20 personas)"}]'::jsonb, 'done', 0.4, null, ('2026-11-03 09:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('db58ee34-b176-4d95-aca4-3f7bf5323f77', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '692bc6e7-0b43-40b4-ab0e-fadc6827d52c', 1, 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', '36be8074-504e-4ef4-aa98-135ad3e9acb0', '5a752a50-bda6-4141-ade2-7528ebf1fbe5', 'peticion', 'Dar de alta en el CRM los 8 contactos con su puntuación', 'Nuria recibió una petición de Daniel', '[{"label":"Contactos","value":"8 nuevos"},{"label":"Puntuación media","value":"72 / 100"},{"label":"Propietario","value":"Lucía Ramos"}]'::jsonb, 'in_progress', 0.5, null, ('2026-11-03 09:50:00'::timestamp at time zone 'Europe/Madrid')),
  ('ee480e5e-6a28-4731-a9df-4f4ad68f0687', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '692bc6e7-0b43-40b4-ab0e-fadc6827d52c', 2, 'ccd5fab2-0b1d-4f27-a5ab-c52c0ee37542', 'a10039a1-1894-4397-a99c-1331d0db0e02', 'acae02d0-24d4-4328-a496-3e3902b9df15', 'acae02d0-24d4-4328-a496-3e3902b9df15', 'peticion', 'Convertir el boletín en un anuncio de remarketing', 'Álvaro rechazó la petición de Carla', '[{"label":"Pieza","value":"Boletín de octubre · versión corta"},{"label":"Motivo del rechazo","value":"El presupuesto de remarketing está agotado hasta diciembre"}]'::jsonb, 'rejected', 0.2, null, ('2026-11-03 10:05:00'::timestamp at time zone 'Europe/Madrid'));

-- Memoria: nodos y conexiones ----------------------------------------------------------
insert into public.memory_nodes (id, company_id, contact_id, node_type, title, content, created_by_agent_id, confidence, created_at) values
  ('256528b3-b159-457c-ad5e-b85ea46882f5', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'contacto', 'Laura Gómez', 'Directora de Clínica Sol y contacto principal. Llegó desde un anuncio de Meta Ads y tiene una propuesta pendiente de envío.', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 1.00, ('2026-10-21 09:12:00'::timestamp at time zone 'Europe/Madrid')),
  ('41a1c8e2-44f8-4180-a5cb-4c10220fa317', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'empresa', 'Clínica Sol', 'Clínica dental en Chamberí (Madrid) con 14 empleados y 3 gabinetes. Sin gestor de reservas online.', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', 1.00, ('2026-10-21 09:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('a51c6ded-770e-4028-a177-e83f2dcf78ad', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'campana', 'Clínicas dentales – Madrid', 'Campaña de Meta Ads dirigida a clínicas dentales de Madrid. Ha generado 12 leads con buen perfil y 1 venta.', 'a10039a1-1894-4397-a99c-1331d0db0e02', 1.00, ('2026-10-06 11:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('69a100e3-58a8-4a03-a39d-88fde2d00ad9', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'correo', 'Seguimiento del plan anual', 'Primer seguimiento enviado por Lucía: presenta el plan anual y propone una llamada de 15 minutos.', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 1.00, ('2026-10-24 10:05:00'::timestamp at time zone 'Europe/Madrid')),
  ('365cb87e-fa59-4be6-a5cb-747b04d7a6b1', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'correo', 'Respuesta de Laura', '«Nos interesa, pero el precio nos parece alto comparado con la oferta que ya tenemos.»', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2', 1.00, ('2026-10-27 16:40:00'::timestamp at time zone 'Europe/Madrid')),
  ('a9c55625-d9b6-44a6-a300-52596f05f01a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'dato', 'Objeción: precio', 'Considera caro el plan anual de 4.200 € y lo compara con otra oferta de 3.500 €.', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 0.90, ('2026-10-27 16:45:00'::timestamp at time zone 'Europe/Madrid')),
  ('c03c8b7f-4e96-4e84-a1c0-8ae1993cb3f4', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'dato', 'Presupuesto: 3.500–4.500 €', 'Rango indicado en el formulario de cualificación para digitalizar reservas y recordatorios.', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 0.90, ('2026-10-21 09:18:00'::timestamp at time zone 'Europe/Madrid')),
  ('c5000ad9-2b3a-4606-a114-c1b3b311a72f', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'dato', 'Prefiere llamadas por la tarde', 'Atiende pacientes por la mañana: contactar a partir de las 16:00.', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 0.90, ('2026-10-21 09:19:00'::timestamp at time zone 'Europe/Madrid')),
  ('e249afb6-248a-4400-a6e7-6da7ef7e38eb', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'tarea', 'Propuesta de 4.200 €', 'Propuesta del plan anual lista para enviar. Espera tu aprobación en la vista Aprobaciones.', 'dcd7cbec-7832-4214-a61e-866573d373ea', 1.00, ('2026-11-03 10:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('81ddfa23-935b-4be7-ac14-9863d6f9f589', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'tarea', 'Llamada de seguimiento', 'Llamar el jueves por la tarde para resolver la duda de precio antes de enviar la propuesta.', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 1.00, ('2026-10-28 09:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('d586116a-9e93-445f-a8f2-08a47cc41940', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'agente', 'Daniel Prieto', 'Cualificación de leads · creado por Leadforge. En este cliente ha generado 3 elementos.', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 1.00, ('2026-10-21 09:12:00'::timestamp at time zone 'Europe/Madrid')),
  ('2a40eed2-e5d0-4881-a657-55ec949df7d2', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'agente', 'Nuria Campos', 'Actualización de CRM · creado por Flujo Ops. En este cliente ha generado 1 elemento.', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', 1.00, ('2026-10-21 09:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('243b3d56-499d-46ac-acda-cd629731d5c7', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'agente', 'Álvaro Ríos', 'Gestor de campañas · creado por Verbo Studio. En este cliente ha generado 1 elemento.', 'a10039a1-1894-4397-a99c-1331d0db0e02', 1.00, ('2026-10-06 11:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('b3c3fe49-b246-4563-a0ba-0ef33d81a89a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'agente', 'Lucía Ramos', 'Seguimiento comercial · creado por Estudio Cálamo. En este cliente ha generado 3 elementos.', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 1.00, ('2026-10-24 10:05:00'::timestamp at time zone 'Europe/Madrid')),
  ('c73d8f2d-b2ae-427f-a8c9-881f9c18ed5a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'agente', 'Hugo Lara', 'Atención por correo · creado por Helpdesk Labs. En este cliente ha generado 1 elemento.', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2', 1.00, ('2026-10-27 16:40:00'::timestamp at time zone 'Europe/Madrid')),
  ('a66bd7a2-2a10-419f-acdd-d5359e19bab7', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3284e4bb-f1b6-4970-a406-41ca6176e2c5', 'agente', 'Irene Soler', 'Propuestas comerciales · creado por Estudio Cálamo. En este cliente ha generado 1 elemento.', 'dcd7cbec-7832-4214-a61e-866573d373ea', 1.00, ('2026-11-03 10:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('647cef10-b09f-48b4-a787-279c17187833', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'contacto', 'Javier Ortega', 'Gerente de Reformas Ortega. Se suscribió al boletín de otoño y contrató el plan trimestral.', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 1.00, ('2026-10-14 12:05:00'::timestamp at time zone 'Europe/Madrid')),
  ('f7ee2cb9-7237-4597-ad6e-07a186c5f459', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'empresa', 'Reformas Ortega', 'Empresa de reformas integrales en Valencia con 9 empleados.', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', 1.00, ('2026-10-14 12:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('2fdedd0e-0194-4012-ad7f-75afc56bf37f', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'campana', 'Boletín de otoño', 'Boletín con casos de reformas de otoño. Superó su objetivo de clics en un 18 %.', 'ccd5fab2-0b1d-4f27-a5ab-c52c0ee37542', 1.00, ('2026-10-02 10:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('a40e7393-eb20-4665-a0ce-6b705cdd1ebf', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'correo', 'Propuesta de 2.800 €', 'Propuesta del plan trimestral con calendario de pagos, enviada tras tu aprobación.', 'dcd7cbec-7832-4214-a61e-866573d373ea', 1.00, ('2026-10-16 09:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('a7c911d1-7ce7-4ad2-adf7-a762d51c3a15', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'correo', 'Duda sobre IVA y pagos', 'Pregunta si el precio incluye IVA y si puede pagar a 30 días.', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2', 1.00, ('2026-10-30 17:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('953d9be2-54fc-45b8-a181-1b092a15b292', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'dato', 'Plan trimestral', 'Contratado el 28 de octubre por 2.800 € más IVA.', 'ba4ca42c-4868-4073-ad9f-44604088a4f5', 0.90, ('2026-10-28 11:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('8fc6e99a-8fce-4090-a990-72910e8ede80', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'dato', 'Pago por transferencia a 30 días', 'Forma de pago acordada con la empresa.', 'ba4ca42c-4868-4073-ad9f-44604088a4f5', 0.90, ('2026-10-28 11:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('f4462df1-2ae1-43c9-a863-5298d43dc46b', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'tarea', 'Factura de 2.800 €', 'Emitir la factura del plan trimestral en el cierre de mes.', 'ba4ca42c-4868-4073-ad9f-44604088a4f5', 1.00, ('2026-10-28 11:25:00'::timestamp at time zone 'Europe/Madrid')),
  ('c6358e29-b924-4b5b-a7c2-25131f6aa9d7', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'tarea', 'Responder duda del IVA', 'Confirmar que el precio no incluye IVA y que la transferencia a 30 días ya está acordada.', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2', 1.00, ('2026-10-30 17:25:00'::timestamp at time zone 'Europe/Madrid')),
  ('99593125-ee77-413e-a612-295214929c29', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'agente', 'Daniel Prieto', 'Cualificación de leads · creado por Leadforge. En este cliente ha generado 1 elemento.', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 1.00, ('2026-10-14 12:05:00'::timestamp at time zone 'Europe/Madrid')),
  ('e2c3460e-2cc6-4aa5-a540-fc0dd3d40a9a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'agente', 'Nuria Campos', 'Actualización de CRM · creado por Flujo Ops. En este cliente ha generado 1 elemento.', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', 1.00, ('2026-10-14 12:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('35ae9233-7cac-40e1-ac6d-ac2ac3f80045', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'agente', 'Carla Medina', 'Redactora de contenidos · creado por Verbo Studio. En este cliente ha generado 1 elemento.', 'ccd5fab2-0b1d-4f27-a5ab-c52c0ee37542', 1.00, ('2026-10-02 10:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('8d7ffec8-5170-4478-ad10-e69dce4cf098', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'agente', 'Irene Soler', 'Propuestas comerciales · creado por Estudio Cálamo. En este cliente ha generado 1 elemento.', 'dcd7cbec-7832-4214-a61e-866573d373ea', 1.00, ('2026-10-16 09:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('676fe117-71f2-4507-a271-f8f0121374a5', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'agente', 'Hugo Lara', 'Atención por correo · creado por Helpdesk Labs. En este cliente ha generado 2 elementos.', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2', 1.00, ('2026-10-30 17:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('368d7ba9-e87a-4820-ae9f-3f1bb3f4c209', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '7df1fdde-2d26-4774-a0a8-323b849c27f1', 'agente', 'Tomás Vidal', 'Facturación · creado por Flujo Ops. En este cliente ha generado 3 elementos.', 'ba4ca42c-4868-4073-ad9f-44604088a4f5', 1.00, ('2026-10-28 11:15:00'::timestamp at time zone 'Europe/Madrid')),
  ('5101865b-c834-411a-ae00-629f0e799d14', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'contacto', 'Marta Ibáñez', 'Socia de Ibáñez & Asociados. Pidió una demo de atención automática para su despacho.', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 1.00, ('2026-10-29 15:40:00'::timestamp at time zone 'Europe/Madrid')),
  ('2dc48d16-e104-465b-a565-8685d7f8828c', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'empresa', 'Ibáñez & Asociados', 'Despacho de abogados en Zaragoza con 6 profesionales. Atiende unas 40 consultas al mes.', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', 1.00, ('2026-10-29 15:50:00'::timestamp at time zone 'Europe/Madrid')),
  ('3e2e2660-1c73-4725-a036-9b877148c3ef', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'campana', 'Despachos profesionales', 'Campaña de LinkedIn dirigida a despachos y asesorías de más de 5 profesionales.', 'a10039a1-1894-4397-a99c-1331d0db0e02', 1.00, ('2026-10-19 10:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('573374f4-40cb-44b2-a06d-bff992d202cb', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'correo', 'Invitación a la demo', 'Correo de Lucía con tres huecos para una demo de 20 minutos.', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 1.00, ('2026-10-30 09:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('dd5f2b1a-855d-494e-ad8f-03d6a1e9c48e', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'dato', 'Interés: atender consultas', 'Quiere automatizar la primera respuesta a las consultas que llegan por la web.', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 0.90, ('2026-10-29 15:45:00'::timestamp at time zone 'Europe/Madrid')),
  ('6ac42f1a-dbd7-42aa-aff2-29c023c7091c', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'dato', 'Objeción: protección de datos', 'Necesita garantías de cumplimiento del RGPD y de secreto profesional antes de seguir.', '426ade0b-f542-472b-aa70-3b385993a459', 0.90, ('2026-11-02 13:20:00'::timestamp at time zone 'Europe/Madrid')),
  ('da563dd9-a412-4590-a368-59239a9b9c0b', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'tarea', 'Enviar documento de seguridad', 'Enviar el resumen de seguridad y RGPD de los agentes certificados.', '426ade0b-f542-472b-aa70-3b385993a459', 1.00, ('2026-11-02 13:30:00'::timestamp at time zone 'Europe/Madrid')),
  ('293705fa-7c0b-4692-a304-4fd233e7fc4d', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'agente', 'Daniel Prieto', 'Cualificación de leads · creado por Leadforge. En este cliente ha generado 2 elementos.', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe', 1.00, ('2026-10-29 15:40:00'::timestamp at time zone 'Europe/Madrid')),
  ('ddcddc2a-eced-4fdf-a5c0-afc6282d8482', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'agente', 'Nuria Campos', 'Actualización de CRM · creado por Flujo Ops. En este cliente ha generado 1 elemento.', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0', 1.00, ('2026-10-29 15:50:00'::timestamp at time zone 'Europe/Madrid')),
  ('39dc9f90-16de-451c-abb7-62abfa7d7975', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'agente', 'Álvaro Ríos', 'Gestor de campañas · creado por Verbo Studio. En este cliente ha generado 1 elemento.', 'a10039a1-1894-4397-a99c-1331d0db0e02', 1.00, ('2026-10-19 10:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('8348e491-774b-438e-af4a-03cbfd7b9f47', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'agente', 'Lucía Ramos', 'Seguimiento comercial · creado por Estudio Cálamo. En este cliente ha generado 1 elemento.', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4', 1.00, ('2026-10-30 09:00:00'::timestamp at time zone 'Europe/Madrid')),
  ('8b922306-cba7-474d-a7b0-3bcc0d9fc438', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '475a43fe-a454-4192-aa65-34dbdd28b35a', 'agente', 'Sofía Navarro', 'Atención por chat · creado por Helpdesk Labs. En este cliente ha generado 2 elementos.', '426ade0b-f542-472b-aa70-3b385993a459', 1.00, ('2026-11-02 13:20:00'::timestamp at time zone 'Europe/Madrid'));
insert into public.memory_edges (id, company_id, from_node_id, to_node_id, kind, created_by_agent_id) values
  ('f35ebbcf-08ee-490e-ad30-c64c5789bc04', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', '41a1c8e2-44f8-4180-a5cb-4c10220fa317', 'trabaja_en', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0'),
  ('989dbd1e-6a97-42e3-ae2f-4e939fab57de', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', 'a51c6ded-770e-4028-a177-e83f2dcf78ad', 'llego_por', 'a10039a1-1894-4397-a99c-1331d0db0e02'),
  ('e551c193-90fd-4e72-a3a1-2ac68c57451a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', '69a100e3-58a8-4a03-a39d-88fde2d00ad9', 'recibio', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'),
  ('5dcdee43-0dd2-4774-a99a-a9fa1fbf3b51', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', '365cb87e-fa59-4be6-a5cb-747b04d7a6b1', 'respondio', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2'),
  ('e07f458f-9a31-4a84-a726-b07c9ecc6232', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', 'a9c55625-d9b6-44a6-a300-52596f05f01a', 'respondio', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'),
  ('aefbe57b-9ba8-4d8d-ad0f-aa6c49959397', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', 'c03c8b7f-4e96-4e84-a1c0-8ae1993cb3f4', 'respondio', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe'),
  ('c985d40d-333e-4312-aa4a-7dd61d78a059', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', 'c5000ad9-2b3a-4606-a114-c1b3b311a72f', 'respondio', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe'),
  ('390ad76a-8125-4e3b-acad-63c8502d561c', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', 'e249afb6-248a-4400-a6e7-6da7ef7e38eb', 'tiene_pendiente', 'dcd7cbec-7832-4214-a61e-866573d373ea'),
  ('cd93484c-26ed-4236-a127-37387071ab6a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', '81ddfa23-935b-4be7-ac14-9863d6f9f589', 'tiene_pendiente', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'),
  ('fe370afe-9381-4367-a1d6-6678c3939212', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '256528b3-b159-457c-ad5e-b85ea46882f5', 'd586116a-9e93-445f-a8f2-08a47cc41940', 'creado_por', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe'),
  ('eefa0af9-8ce2-42a4-a183-dd775f9e4c74', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '41a1c8e2-44f8-4180-a5cb-4c10220fa317', '2a40eed2-e5d0-4881-a657-55ec949df7d2', 'creado_por', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0'),
  ('888799c4-313b-40b7-a55e-6e05749dba37', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'a51c6ded-770e-4028-a177-e83f2dcf78ad', '243b3d56-499d-46ac-acda-cd629731d5c7', 'creado_por', 'a10039a1-1894-4397-a99c-1331d0db0e02'),
  ('722f7379-2da5-445e-af17-bedee5909a7e', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '69a100e3-58a8-4a03-a39d-88fde2d00ad9', 'b3c3fe49-b246-4563-a0ba-0ef33d81a89a', 'creado_por', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'),
  ('a95f8845-49a8-4a84-a2a5-47aa0fea7c85', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '365cb87e-fa59-4be6-a5cb-747b04d7a6b1', 'c73d8f2d-b2ae-427f-a8c9-881f9c18ed5a', 'creado_por', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2'),
  ('cb723bb1-33c2-40bd-aa14-99d095881dbe', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'a9c55625-d9b6-44a6-a300-52596f05f01a', 'b3c3fe49-b246-4563-a0ba-0ef33d81a89a', 'creado_por', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'),
  ('3f8a4ee1-5bfa-499a-ade8-303704918a40', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'c03c8b7f-4e96-4e84-a1c0-8ae1993cb3f4', 'd586116a-9e93-445f-a8f2-08a47cc41940', 'creado_por', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe'),
  ('f6776ad1-c318-498f-aafd-d93490ef97b8', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'c5000ad9-2b3a-4606-a114-c1b3b311a72f', 'd586116a-9e93-445f-a8f2-08a47cc41940', 'creado_por', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe'),
  ('4e610762-c5c8-448c-a0e0-f5aa503e20c2', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'e249afb6-248a-4400-a6e7-6da7ef7e38eb', 'a66bd7a2-2a10-419f-acdd-d5359e19bab7', 'creado_por', 'dcd7cbec-7832-4214-a61e-866573d373ea'),
  ('d35c66a1-4a27-417d-a6f2-9c5555e2b776', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '81ddfa23-935b-4be7-ac14-9863d6f9f589', 'b3c3fe49-b246-4563-a0ba-0ef33d81a89a', 'creado_por', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'),
  ('e49cd4cd-0126-42ef-afc6-ecaee4992b0b', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '647cef10-b09f-48b4-a787-279c17187833', 'f7ee2cb9-7237-4597-ad6e-07a186c5f459', 'trabaja_en', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0'),
  ('3f59c595-f16a-440b-a7d4-1afb36768192', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '647cef10-b09f-48b4-a787-279c17187833', '2fdedd0e-0194-4012-ad7f-75afc56bf37f', 'llego_por', 'ccd5fab2-0b1d-4f27-a5ab-c52c0ee37542'),
  ('a4350d59-6c75-4547-a2f5-82c28a62bb88', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '647cef10-b09f-48b4-a787-279c17187833', 'a40e7393-eb20-4665-a0ce-6b705cdd1ebf', 'recibio', 'dcd7cbec-7832-4214-a61e-866573d373ea'),
  ('c2f13424-2fed-42b0-af44-59a5035ee994', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '647cef10-b09f-48b4-a787-279c17187833', 'a7c911d1-7ce7-4ad2-adf7-a762d51c3a15', 'respondio', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2'),
  ('d3c86488-6641-41a3-a595-6cde11d7325c', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '647cef10-b09f-48b4-a787-279c17187833', '953d9be2-54fc-45b8-a181-1b092a15b292', 'respondio', 'ba4ca42c-4868-4073-ad9f-44604088a4f5'),
  ('45baa32a-067a-4984-abbe-4dbf63cad315', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '647cef10-b09f-48b4-a787-279c17187833', '8fc6e99a-8fce-4090-a990-72910e8ede80', 'respondio', 'ba4ca42c-4868-4073-ad9f-44604088a4f5'),
  ('09856889-131f-4f9c-afb0-35a3e66ddc0e', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '647cef10-b09f-48b4-a787-279c17187833', 'f4462df1-2ae1-43c9-a863-5298d43dc46b', 'tiene_pendiente', 'ba4ca42c-4868-4073-ad9f-44604088a4f5'),
  ('417098c8-ef51-40cd-ada5-e5b138539db5', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '647cef10-b09f-48b4-a787-279c17187833', 'c6358e29-b924-4b5b-a7c2-25131f6aa9d7', 'tiene_pendiente', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2'),
  ('3aebf258-7b97-4e32-a1ae-45a92b0d18e7', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '647cef10-b09f-48b4-a787-279c17187833', '99593125-ee77-413e-a612-295214929c29', 'creado_por', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe'),
  ('7ff67a4a-30fd-44aa-a1a0-bbdf49fcc02a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'f7ee2cb9-7237-4597-ad6e-07a186c5f459', 'e2c3460e-2cc6-4aa5-a540-fc0dd3d40a9a', 'creado_por', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0'),
  ('57c4a5ea-90e1-4ac1-a8dd-39faa259a1a4', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '2fdedd0e-0194-4012-ad7f-75afc56bf37f', '35ae9233-7cac-40e1-ac6d-ac2ac3f80045', 'creado_por', 'ccd5fab2-0b1d-4f27-a5ab-c52c0ee37542'),
  ('46fccbfe-2820-4e57-ac4d-06e969ab2ede', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'a40e7393-eb20-4665-a0ce-6b705cdd1ebf', '8d7ffec8-5170-4478-ad10-e69dce4cf098', 'creado_por', 'dcd7cbec-7832-4214-a61e-866573d373ea'),
  ('9a9e98d8-52f0-4715-af8f-2d30e173397b', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'a7c911d1-7ce7-4ad2-adf7-a762d51c3a15', '676fe117-71f2-4507-a271-f8f0121374a5', 'creado_por', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2'),
  ('94e54ebe-df62-49bb-a316-90165eb8ad8f', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '953d9be2-54fc-45b8-a181-1b092a15b292', '368d7ba9-e87a-4820-ae9f-3f1bb3f4c209', 'creado_por', 'ba4ca42c-4868-4073-ad9f-44604088a4f5'),
  ('9213112c-9630-4a1a-a500-8454f7b44c2f', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '8fc6e99a-8fce-4090-a990-72910e8ede80', '368d7ba9-e87a-4820-ae9f-3f1bb3f4c209', 'creado_por', 'ba4ca42c-4868-4073-ad9f-44604088a4f5'),
  ('9de974b1-8f55-4a25-a599-51d5dcfa6579', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'f4462df1-2ae1-43c9-a863-5298d43dc46b', '368d7ba9-e87a-4820-ae9f-3f1bb3f4c209', 'creado_por', 'ba4ca42c-4868-4073-ad9f-44604088a4f5'),
  ('1805b452-a1c9-4827-a6c9-c379872fe34c', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'c6358e29-b924-4b5b-a7c2-25131f6aa9d7', '676fe117-71f2-4507-a271-f8f0121374a5', 'creado_por', 'cd7c9591-feec-41d3-a352-9ef34d41a1f2'),
  ('5c119cec-7bdb-4d9e-aacc-87643472fce6', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '5101865b-c834-411a-ae00-629f0e799d14', '2dc48d16-e104-465b-a565-8685d7f8828c', 'trabaja_en', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0'),
  ('5f489006-1b74-46d1-a00d-44da20307b05', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '5101865b-c834-411a-ae00-629f0e799d14', '3e2e2660-1c73-4725-a036-9b877148c3ef', 'llego_por', 'a10039a1-1894-4397-a99c-1331d0db0e02'),
  ('150fd5b9-9da4-40d1-a18b-ebdef2064293', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '5101865b-c834-411a-ae00-629f0e799d14', '573374f4-40cb-44b2-a06d-bff992d202cb', 'recibio', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'),
  ('b9c62cca-672a-479a-a76e-4b77f137721a', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '5101865b-c834-411a-ae00-629f0e799d14', 'dd5f2b1a-855d-494e-ad8f-03d6a1e9c48e', 'respondio', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe'),
  ('04638a39-9951-4982-a5a0-5ac161ed2f75', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '5101865b-c834-411a-ae00-629f0e799d14', '6ac42f1a-dbd7-42aa-aff2-29c023c7091c', 'respondio', '426ade0b-f542-472b-aa70-3b385993a459'),
  ('2b6c1d1b-80f3-4616-aa8b-c9d52cd92cb7', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '5101865b-c834-411a-ae00-629f0e799d14', 'da563dd9-a412-4590-a368-59239a9b9c0b', 'tiene_pendiente', '426ade0b-f542-472b-aa70-3b385993a459'),
  ('cf71c705-47c0-4dd6-ab58-3bce38b89999', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '5101865b-c834-411a-ae00-629f0e799d14', '293705fa-7c0b-4692-a304-4fd233e7fc4d', 'creado_por', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe'),
  ('2608001b-d754-4586-a2bc-8d1963bd91a0', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '2dc48d16-e104-465b-a565-8685d7f8828c', 'ddcddc2a-eced-4fdf-a5c0-afc6282d8482', 'creado_por', 'ff8c5e5f-b60a-4fdf-ab7b-f7e7fed013a0'),
  ('9921dc23-c366-4726-ac35-f2226e4ad6fb', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '3e2e2660-1c73-4725-a036-9b877148c3ef', '39dc9f90-16de-451c-abb7-62abfa7d7975', 'creado_por', 'a10039a1-1894-4397-a99c-1331d0db0e02'),
  ('96609577-879d-4837-a544-f55b4bdc09db', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '573374f4-40cb-44b2-a06d-bff992d202cb', '8348e491-774b-438e-af4a-03cbfd7b9f47', 'creado_por', '0e9902f1-d636-4806-a597-7d1d4bf9e7b4'),
  ('e2a53d4d-d7e8-44ce-a1ba-2990b458be70', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'dd5f2b1a-855d-494e-ad8f-03d6a1e9c48e', '293705fa-7c0b-4692-a304-4fd233e7fc4d', 'creado_por', 'f0467970-e1cb-45bf-a6db-7f9bcf2f2efe'),
  ('602c223f-742e-43ac-ae78-46cc49fd644f', 'a64499d1-7f43-4a43-abc8-41a313dc4018', '6ac42f1a-dbd7-42aa-aff2-29c023c7091c', '8b922306-cba7-474d-a7b0-3bcc0d9fc438', 'creado_por', '426ade0b-f542-472b-aa70-3b385993a459'),
  ('3fb408c3-a582-40b3-aa4f-abbd761630a7', 'a64499d1-7f43-4a43-abc8-41a313dc4018', 'da563dd9-a412-4590-a368-59239a9b9c0b', '8b922306-cba7-474d-a7b0-3bcc0d9fc438', 'creado_por', '426ade0b-f542-472b-aa70-3b385993a459');

-- Motor de agentes: herramientas y primeras instrucciones de los agentes comerciales y de atención (ejemplo) ------
update public.agents
   set allowed_tools = allowed_tools || array['buscar_en_memoria', 'ver_historial_del_contacto', 'guardar_recuerdo', 'redactar_correo', 'pasar_a_departamento']
 where slug in ('lucia-ramos', 'irene-soler', 'daniel-prieto', 'hugo-lara', 'sofia-navarro');

update public.agents set instructions = 'Eres Lucía Ramos, agente de Seguimiento comercial de Hogar Mediterráneo, una empresa que vende gestión de citas con IA a clínicas y pequeños negocios (plan anual de 4.200 €).
Tu trabajo: cuidar a los leads y clientes, recordar lo que pasó con cada uno y proponer el siguiente paso.
Cómo trabajas:
1. Antes de decidir nada, consulta la memoria con buscar_en_memoria (y ver_historial_del_contacto si ya hay trato).
2. Guarda con guardar_recuerdo lo importante y nuevo (quién es, qué necesita, objeciones, acuerdos). No dupliques lo que ya está.
3. Si hay que escribir al cliente, usa redactar_correo: solo crea un BORRADOR que una persona aprobará. Nunca digas que has enviado un correo; di que has dejado un borrador pendiente de aprobación.
4. Si el asunto es de otro departamento (facturación, atención al cliente, marketing), usa pasar_a_departamento con un resumen claro.
5. Termina siempre con un resumen breve de lo que has hecho y el siguiente paso que propones.
Tono: cercano, profesional y breve, en español de España. No inventes precios ni plazos que no estén en la memoria o en la tarea.'
 where slug = 'lucia-ramos';
update public.agents set instructions = 'Eres Irene Soler, agente de Propuestas comerciales de Hogar Mediterráneo. Preparas propuestas claras y las adaptas a lo que el cliente ha dicho.
Antes de escribir, consulta la memoria (buscar_en_memoria). Guarda con guardar_recuerdo lo nuevo. Los correos los dejas siempre como borrador con redactar_correo, pendiente de aprobación; nunca afirmes que se han enviado. Termina con un resumen breve y el siguiente paso que propones.'
 where slug = 'irene-soler';
update public.agents set instructions = 'Eres Daniel Prieto, agente de Cualificación de leads de Hogar Mediterráneo. Evalúas si un lead encaja (necesidad, tamaño, urgencia) y lo pasas al equipo adecuado.
Consulta la memoria antes de valorar, guarda lo que averigües con guardar_recuerdo y, si el lead encaja, usa pasar_a_departamento. Los correos son siempre borradores con redactar_correo. Termina con un resumen breve.'
 where slug = 'daniel-prieto';
update public.agents set instructions = 'Eres Hugo Lara, agente de Atención por correo de Hogar Mediterráneo. Respondes dudas de clientes con exactitud y amabilidad.
Consulta la memoria antes de responder. Si no sabes algo, dilo y propón pasarlo a la persona adecuada con pasar_a_departamento. Los correos son siempre borradores con redactar_correo, pendientes de aprobación. Termina con un resumen breve.'
 where slug = 'hugo-lara';
update public.agents set instructions = 'Eres Sofía Navarro, agente de Atención por chat de Hogar Mediterráneo. Atiendes dudas de clientes con cercanía.
Consulta la memoria antes de responder y guarda lo relevante con guardar_recuerdo. Los correos son siempre borradores con redactar_correo, pendientes de aprobación. Si es de otro departamento, usa pasar_a_departamento. Termina con un resumen breve.'
 where slug = 'sofia-navarro';


-- Créditos ------------------------------------------------------------------------------
-- Un lote del pack Pro (16.000 créditos, 365 días) para la empresa de desarrollo. Idempotente por clave.
select public.anadir_lote('a64499d1-7f43-4a43-abc8-41a313dc4018', 'pack', 'pro', null, null, 'seed-local', 'seed:pro-hogar-mediterraneo');


-- Panel interno de márgenes (/admin/margenes) ---------------------------------------------------------------------
-- Equipo de IDESIE: persona con rol admin_idesie (local: admin@idesie.example · contraseña idesie-admin-2026).
-- Vive en su propia «empresa» interna, que no tiene datos y no sale en el panel. Poner su id en DEV_ADMIN_USER_ID.
insert into public.companies (id, name) values ('1de51e00-0000-4000-8000-000000000001', 'IDESIE (equipo interno)');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '1de51e00-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'admin@idesie.example', extensions.crypt('idesie-admin-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '1de51e00-0000-4000-8000-0000000000a1', '1de51e00-0000-4000-8000-0000000000a1', 'email', '{"sub":"1de51e00-0000-4000-8000-0000000000a1","email":"admin@idesie.example","email_verified":true}'::jsonb, now(), now(), now());
insert into public.users (id, company_id, full_name, email, role)
values ('1de51e00-0000-4000-8000-0000000000a1', '1de51e00-0000-4000-8000-000000000001', 'Equipo IDESIE', 'admin@idesie.example', 'admin_idesie');

-- Panel interno de certificación (/admin/certificacion) -----------------------------------------------------------
-- Equipo revisor de prueba (solo local). No son miembros de ninguna empresa: viven en auth.users y en public.reviewers.
--   revisora@samgple.example · samgple-revisora-2026 (Elena Marín, revisora)   ·   revisor@samgple.example · samgple-revisor-2026 (Diego Soto, revisor)
-- La persona del panel de márgenes es además administradora del equipo revisor (decide cuando dos opiniones no coinciden).
-- Las solicitudes de prueba en distintos estados las crea `npm run plantillas:sync -- --datos-de-prueba` (necesitan las plantillas).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '5a39e000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'revisora@samgple.example', extensions.crypt('samgple-revisora-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '5a39e000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'revisor@samgple.example', extensions.crypt('samgple-revisor-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
  from auth.users u
 where u.id in ('5a39e000-0000-4000-8000-0000000000b1', '5a39e000-0000-4000-8000-0000000000b2')
   and not exists (select 1 from auth.identities i where i.user_id = u.id);
insert into public.reviewers (user_id, rol, nombre, categorias)
values
  ('5a39e000-0000-4000-8000-0000000000b1', 'revisor_samgple', 'Elena Marín', '{atencion,ventas,operaciones}'),
  ('5a39e000-0000-4000-8000-0000000000b2', 'revisor_samgple', 'Diego Soto', '{atencion,ventas,marketing,direccion}'),
  ('1de51e00-0000-4000-8000-0000000000a1', 'admin_samgple', 'Admin de prueba', '{ventas,atencion,marketing,operaciones,direccion,personalizado}')
on conflict (user_id) do nothing;

-- Tres empresas ficticias con 4 meses de compras, consumo, costes de IA, caducidades y alertas.
-- Se insertan directamente (como superusuario) con la misma coherencia que el servicio: suma del libro = créditos de los lotes.
-- Los costes de IA suponen CAMBIO_USD_POR_EUR = 1,08 (un crédito = 10.800 micros de dólar) para las alertas de margen.
do $seed$
declare
  v_emp record; v_ag record; v_m int; v_ini timestamptz; v_fin timestamptz; v_lot uuid; v_dept uuid; v_pack record; v_compra timestamptz;
  v_agentes uuid[]; v_i int;
begin
  perform setseed(0.37);
  create temp table _seed_tasks (task_id uuid, company_id uuid, agent_id uuid, department_id uuid, lot_id uuid, tipo text, modelo text,
    coste bigint, creditos int, creado_en timestamptz) on commit drop;

  for v_emp in select * from (values
    (1, 'a0000000-0000-4000-8000-000000000001'::uuid, 'Clínica Dental Sol, S.L.',        'pro',      3, 1.00),
    (2, 'a0000000-0000-4000-8000-000000000002'::uuid, 'Taller Medina e Hijos',            'inicio',   3, 0.45),
    (3, 'a0000000-0000-4000-8000-000000000003'::uuid, 'Estudio de Arquitectura Norte',    'business', 2, 1.60)
  ) as t(n, id, nombre, pack, meses, escala)
  loop
    insert into public.companies (id, name) values (v_emp.id, v_emp.nombre);
    v_dept := gen_random_uuid();
    insert into public.departments (id, company_id, slug, name, tipo, orden) values (v_dept, v_emp.id, 'ventas', 'Ventas', 'ventas', 1);
    v_agentes := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
    insert into public.agents (id, company_id, department_id, slug, name, role, creator_name, model, allowed_tools) values
      (v_agentes[1], v_emp.id, v_dept, 'seguimiento-' || v_emp.n, (array['Marta Ibáñez','Rubén Ortega','Alma Cortés'])[v_emp.n], 'Seguimiento comercial', 'IDESIE', 'claude-haiku-5-5', '{}'),
      (v_agentes[2], v_emp.id, v_dept, 'propuestas-' || v_emp.n, (array['Pablo Serrano','Inés Calvo','Joel Rivas'])[v_emp.n], 'Propuestas', 'IDESIE', 'claude-sonnet-5-5', '{}'),
      (v_agentes[3], v_emp.id, v_dept, 'analisis-' || v_emp.n, (array['Nora Pastor','Gael Mora','Lola Vega'])[v_emp.n], 'Análisis', 'IDESIE', 'claude-sonnet-5-5', '{}');
    select * into v_pack from public.credit_packs where id = v_emp.pack;

    for v_m in reverse v_emp.meses..0 loop
      v_ini := (date_trunc('month', now() at time zone 'Europe/Madrid') - make_interval(months => v_m)) at time zone 'Europe/Madrid';
      v_fin := (date_trunc('month', now() at time zone 'Europe/Madrid') - make_interval(months => v_m - 1)) at time zone 'Europe/Madrid';
      v_compra := v_ini + interval '1 minute';
      v_lot := gen_random_uuid();
      insert into public.purchases (company_id, pack_id, modalidad, importe_centimos, iva_centimos, estado, referencia_externa, creado_en)
      values (v_emp.id, v_pack.id, 'unico', v_pack.precio_centimos, round(v_pack.precio_centimos * 0.21), 'pagada', format('seed:%s:%s', v_emp.n, v_m), v_compra);
      insert into public.credit_lots (id, company_id, origen, pack_id, creditos_iniciales, creditos_restantes, caduca_en, creado_en, referencia_pago)
      values (v_lot, v_emp.id, 'pack', v_pack.id, v_pack.creditos, v_pack.creditos, v_compra + interval '365 days', v_compra, format('seed:%s:%s', v_emp.n, v_m));
      insert into public.credit_ledger (company_id, tipo, creditos, lot_id, concepto, creado_en)
      values (v_emp.id, 'compra', v_pack.creditos, v_lot, 'compra_pack', v_compra);

      -- Tareas del mes: agente 1 (Haiku) eficiente, agente 2 (Sonnet) normal, agente 3 (Sonnet) caro y con peor margen.
      for v_i in 1..3 loop
        insert into _seed_tasks
        select gen_random_uuid(), v_emp.id, v_agentes[v_i], v_dept, v_lot, t.tipo,
               case when t.tipo = 'experta' then 'claude-sonnet-5-5' when t.tipo = 'simple' then 'claude-haiku-5-5'
                    when v_i = 1 then 'claude-haiku-5-5' else 'claude-sonnet-5-5' end,
               (t.base * (array[0.8, 1.0, 1.65])[v_i] * (0.75 + 0.5 * random()))::bigint,
               t.creditos,
               (v_ini + interval '1 hour') + (least(v_fin, now()) - (v_ini + interval '1 hour')) * random()
          from (values ('simple', 3000, 2, 40), ('estandar', 30000, 10, 14), ('experta', 220000, 50, 3)) as t(tipo, base, creditos, n),
               generate_series(1, greatest(1, round(t.n * v_emp.escala * (1 + (3 - v_m) * 0.12) * (case when v_i = 1 then 1.4 else 1 end))::int)) g
         where not (t.tipo = 'experta' and v_i = 1);
      end loop;
    end loop;

    -- Coste interno y libro: una línea por tarea (el precio de cada tipo lo fija la tarifa: 2 / 10 / 50 créditos).
    insert into public.task_costs (task_id, company_id, agent_id, modelo, tokens_entrada, tokens_salida, tokens_cache, coste_ia_usd_micros, creditos_cobrados, creado_en, tipo_tarea)
    select task_id, company_id, agent_id, modelo, round(coste * 0.6), round(coste * 0.12), round(coste * 0.2), coste, creditos, creado_en, tipo
      from _seed_tasks where company_id = v_emp.id;
    insert into public.credit_ledger (company_id, tipo, creditos, lot_id, task_id, agent_id, department_id, concepto, creado_en)
    select company_id, 'consumo', -creditos, lot_id, task_id, agent_id, department_id, 'tarea_' || tipo, creado_en
      from _seed_tasks where company_id = v_emp.id;
    -- Traspasos y correos del mes en curso (consumos fijos).
    insert into public.credit_ledger (company_id, tipo, creditos, lot_id, agent_id, department_id, concepto, creado_en)
    select v_emp.id, 'consumo', -1, (select id from public.credit_lots where company_id = v_emp.id order by creado_en desc limit 1), v_agentes[1], v_dept,
           (array['traspaso', 'correo'])[1 + (g % 2)], now() - (g || ' hours')::interval
      from generate_series(1, 24 * v_emp.n) g;
  end loop;

  -- Lo consumido sale de cada lote (el libro manda).
  update public.credit_lots l set creditos_restantes = coalesce((
    select sum(creditos) from public.credit_ledger x where x.lot_id = l.id), 0)
   where company_id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003');

  -- Créditos vendidos que caducaron este mes: un regalo sin usar (Taller Medina) y una prueba a medias (Estudio Norte).
  v_ini := date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  for v_emp in select * from (values
    ('a0000000-0000-4000-8000-000000000002'::uuid, 'regalo', null, 400, 400, 'sin usar'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, 'prueba', 'prueba', 2000, 1100, 'a medias')
  ) as t(id, origen, pack, iniciales, caducan, nota) loop
    v_lot := gen_random_uuid();
    insert into public.credit_lots (id, company_id, origen, pack_id, creditos_iniciales, creditos_restantes, caduca_en, creado_en)
    values (v_lot, v_emp.id, v_emp.origen, v_emp.pack, v_emp.iniciales, 0, v_ini + interval '1 day', v_ini - interval '29 days');
    insert into public.credit_ledger (company_id, tipo, creditos, lot_id, concepto, creado_en) values
      (v_emp.id, 'compra', v_emp.iniciales, v_lot, case when v_emp.origen = 'prueba' then 'compra_prueba' else 'regalo' end, v_ini - interval '29 days'),
      (v_emp.id, 'caducidad', -v_emp.caducan, v_lot, 'caducidad', v_ini + interval '1 day');
    if v_emp.iniciales > v_emp.caducan then
      insert into public.credit_ledger (company_id, tipo, creditos, lot_id, concepto, creado_en)
      values (v_emp.id, 'consumo', -(v_emp.iniciales - v_emp.caducan), v_lot, 'tarea_estandar', v_ini - interval '10 days');
    end if;
  end loop;

  -- Alertas internas: margen superado (misma regla que evaluarMargen: coste > 50 % de lo cobrado), límite de pasos y recargas fallidas.
  insert into public.internal_alerts (tipo, company_id, agent_id, task_id, detalle, creado_en)
  select 'margen_superado', company_id, agent_id, task_id,
         jsonb_build_object('tipo_tarea', tipo_tarea, 'modelo', modelo, 'ratio', round(coste_ia_usd_micros::numeric / (creditos_cobrados * 10800), 3)), creado_en
    from public.task_costs
   where company_id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003')
     and coste_ia_usd_micros > creditos_cobrados * 10800 * 0.5;
  insert into public.internal_alerts (tipo, company_id, agent_id, task_id, detalle, creado_en)
  select 'limite_pasos', company_id, agent_id, task_id, jsonb_build_object('tipo_tarea', tipo_tarea, 'pasos', 12, 'maxPasos', 12), creado_en
    from public.task_costs where tipo_tarea = 'experta' and random() < 0.12
     and company_id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003');
  insert into public.internal_alerts (tipo, company_id, detalle, creado_en) values
    ('recarga_fallida', 'a0000000-0000-4000-8000-000000000001', '{"pack": "pro", "motivo": "pago_rechazado"}', now() - interval '2 days'),
    ('recarga_fallida', 'a0000000-0000-4000-8000-000000000003', '{"pack": "business", "motivo": "tarjeta_caducada"}', now() - interval '9 days');
end
$seed$;
