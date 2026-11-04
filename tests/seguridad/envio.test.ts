/** 3. Un agente intenta enviar un correo sin aprobación o por encima de su límite diario: debe fallar. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { SupabaseAgentStore } from "../../src/lib/agents/supabaseStore.ts";
import { HERRAMIENTAS } from "../../src/lib/agents/tools.ts";
import { emailConfigFromEnv } from "../../src/lib/email/config.ts";
import type { EmailSender, OutgoingEmail } from "../../src/lib/email/sender.ts";
import { aprobarYEnviar, enviarCorreo, type EmailDeps } from "../../src/lib/email/service.ts";
import { SupabaseEmailStore } from "../../src/lib/email/supabaseStore.ts";
import { admin, COMPANY_A, createUser, psql, RUN } from "./entorno.ts";
import { borrarAgente, crearAgente } from "./datos.ts";

const enviados: OutgoingEmail[] = [];
const sender: EmailSender = { async send(e) { enviados.push(e); return { id: `re_sec_${enviados.length}` }; } };
const config = { ...emailConfigFromEnv(), apiKey: "clave-falsa" };

let agente: { id: string; slug: string };
let contacto: { id: string; email: string };
let userId: string;
const agentes = SupabaseAgentStore.fromEnv()!;
const correo = SupabaseEmailStore.fromEnv()!;
const deps = (): EmailDeps => ({ store: correo, sender, config });

before(async () => {
  assert.ok(config.from && config.replyTo, "falta RESEND_FROM_EMAIL o RESEND_REPLY_TO");
  agente = await crearAgente("envio", 1);
  const email = `delivered+sec${RUN}@resend.dev`;
  const { data } = await admin.from("contacts").insert({ company_id: COMPANY_A, name: "Destino de prueba", email }).select("id").single();
  contacto = { id: data!.id, email };
  userId = (await createUser(COMPANY_A, "owner", "envio")).id;
});
after(async () => {
  await borrarAgente(agente.id);
  await admin.from("contacts").delete().eq("id", contacto.id);
  await admin.from("users").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
});

const borrador = (n: string) => agentes.createDraft(COMPANY_A, { agentId: agente.id, contactId: contacto.id, subject: `Asunto ${n} ${RUN}`, body: `Cuerpo ${n}` });

describe("sin aprobación no sale nada", () => {
  it("un borrador de agente no se puede enviar: ni por la aplicación ni saltándosela con la clave de servicio", async () => {
    const d = await borrador("sin-aprobar");
    await assert.rejects(() => enviarCorreo(deps(), COMPANY_A, d.emailId), (e: { code?: string }) => e.code === "sin_aprobacion");
    assert.equal(enviados.length, 0);
    // Saltándose la aplicación: forzar el estado «enviado» directamente en la base.
    const r = await admin.from("emails").update({ delivery_status: "sent" }).eq("id", d.emailId);
    assert.match(r.error?.message ?? "", /sin aprobación registrada/);
    const r2 = await admin.from("emails").insert({ company_id: COMPANY_A, thread_id: d.threadId, direction: "outbound", from_address: "a@b.es", to_address: contacto.email, subject: "Colado", body: "x", delivery_status: "sent" });
    assert.match(r2.error?.message ?? "", /sin aprobación registrada/);
    assert.equal((await admin.from("emails").select("delivery_status").eq("id", d.emailId).single()).data?.delivery_status, "pending_approval");
  });

  it("la aprobación pendiente o rechazada no basta; tampoco una aprobación de otro correo", async () => {
    const d = await borrador("rechazada");
    assert.ok(await agentes.rejectDraft(COMPANY_A, d.approvalId, userId));
    await assert.rejects(() => enviarCorreo(deps(), COMPANY_A, d.emailId));
    const r = await aprobarYEnviar(deps(), COMPANY_A, userId, { agentSlug: agente.slug, toEmail: contacto.email, subject: `Asunto rechazada ${RUN}`, body: "Cuerpo rechazada" });
    assert.equal(r.estado, "no_enviado");
    // Una aprobación ya resuelta es definitiva: no se puede reabrir ni cambiar.
    const reabrir = await admin.from("approvals").update({ status: "approved" }).eq("id", d.approvalId);
    assert.match(reabrir.error?.message ?? "", /ya está resuelta/);
    // Apuntar el correo a la aprobación de OTRO correo (esta sí aprobada) tampoco sirve: el texto no coincide con lo aprobado.
    const otro = await borrador("otro");
    await correo.approveDraft(COMPANY_A, otro.approvalId, userId, { subject: `Asunto otro ${RUN}`, body: "Texto aprobado de otro" });
    const d2 = await borrador("robada");
    await admin.from("emails").update({ approval_id: otro.approvalId }).eq("id", d2.emailId);
    const r3 = await admin.from("emails").update({ delivery_status: "sent" }).eq("id", d2.emailId);
    assert.match(r3.error?.message ?? "", /no coincide con el aprobado/);
    await admin.from("emails").update({ approval_id: otro.approvalId, subject: `Asunto otro ${RUN}`, body: "Texto aprobado de otro" }).eq("id", otro.emailId);
    assert.equal(enviados.length, 0);
  });

  it("si el texto cambia después de aprobarse, la base y la aplicación lo rechazan", async () => {
    const d = await borrador("cambiado");
    await correo.approveDraft(COMPANY_A, d.approvalId, userId, { subject: `Asunto cambiado ${RUN}`, body: "Texto aprobado" });
    await admin.from("emails").update({ body: "Texto DISTINTO, con una URL maliciosa" }).eq("id", d.emailId);
    await assert.rejects(() => enviarCorreo(deps(), COMPANY_A, d.emailId), (e: { code?: string }) => e.code === "texto_cambiado");
    const r = await admin.from("emails").update({ delivery_status: "sent" }).eq("id", d.emailId);
    assert.match(r.error?.message ?? "", /no coincide con el aprobado/);
    assert.equal(enviados.length, 0);
  });

  it("los agentes no tienen ninguna herramienta que envíe correo", () => {
    const nombres = HERRAMIENTAS.map((t) => t.name);
    assert.deepEqual(nombres.filter((n) => /envi|send|mail/i.test(n) && n !== "redactar_correo"), []);
    const redactar = HERRAMIENTAS.find((t) => t.name === "redactar_correo")!;
    assert.match(redactar.description, /NO envía/);
  });

  it("una persona de la empresa no puede escribir correos «enviados» desde el navegador", async () => {
    const u = await createUser(COMPANY_A, "owner", "envio-nav");
    const d = await borrador("navegador");
    const ins = await u.client.from("emails").insert({ company_id: COMPANY_A, thread_id: d.threadId, direction: "outbound", from_address: "a@b.es", to_address: "x@y.es", subject: "x", body: "x", delivery_status: "sent" });
    const upd = await u.client.from("emails").update({ delivery_status: "sent" }).eq("id", d.emailId);
    assert.ok(ins.error, "insertar debe fallar");
    assert.equal((await admin.from("emails").select("delivery_status").eq("id", d.emailId).single()).data?.delivery_status, "pending_approval", `actualizar no debe cambiar nada (${upd.error?.message ?? "0 filas"})`);
    await admin.from("users").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  });
});

describe("límite diario del agente (1 correo/día en esta prueba)", () => {
  it("el primero sale; el segundo, aunque esté aprobado, lo para la aplicación y también la base", async () => {
    const hoy = enviados.length;
    const a = await borrador("limite-1");
    const r1 = await aprobarYEnviar(deps(), COMPANY_A, userId, { agentSlug: agente.slug, toEmail: contacto.email, subject: `Asunto limite-1 ${RUN}`, body: "Cuerpo limite-1" });
    assert.equal(r1.estado, "enviado", JSON.stringify(r1));
    assert.equal(enviados.length, hoy + 1);
    assert.equal((await admin.from("emails").select("delivery_status").eq("id", a.emailId).single()).data?.delivery_status, "sent");

    const b = await borrador("limite-2");
    const r2 = await aprobarYEnviar(deps(), COMPANY_A, userId, { agentSlug: agente.slug, toEmail: contacto.email, subject: `Asunto limite-2 ${RUN}`, body: "Cuerpo limite-2" });
    assert.equal(r2.estado, "no_enviado");
    assert.match(r2.estado === "no_enviado" ? r2.mensaje : "", /límite/i);
    assert.equal(enviados.length, hoy + 1, "el segundo correo no salió");

    // Saltándose la aplicación: aprobar a mano y forzar el envío con la clave de servicio.
    await correo.approveDraft(COMPANY_A, b.approvalId, userId, { subject: `Asunto limite-2 ${RUN}`, body: "Cuerpo limite-2" });
    const r = await admin.from("emails").update({ delivery_status: "sent" }).eq("id", b.emailId);
    assert.match(r.error?.message ?? "", /límite diario/);
  });

  it("subir el límite lo decide una persona, no el agente: un miembro no puede cambiarlo", async () => {
    const m = await createUser(COMPANY_A, "member", "limite");
    await m.client.from("agents").update({ daily_email_limit: 1000 }).eq("id", agente.id);
    assert.equal((await admin.from("agents").select("daily_email_limit").eq("id", agente.id).single()).data?.daily_email_limit, 1);
    await admin.from("users").delete().eq("id", m.id);
    await admin.auth.admin.deleteUser(m.id);
  });

  it("la base cuenta los envíos del día de verdad (no solo la aplicación)", () => {
    const n = psql(`select public.agent_emails_sent_today('${COMPANY_A}', '${agente.id}')`);
    assert.equal(Number(n), 1);
  });
});
