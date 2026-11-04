import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Webhook } from "svix";
import { checkRecipient, emailConfigFromEnv, type EmailConfig } from "./config.ts";
import { InMemoryEmailStore } from "./inMemoryStore.ts";
import type { EmailSender, OutgoingEmail } from "./sender.ts";
import { aprobarYEnviar, enviarCorreo, EmailError, registrarEntrega, type EmailDeps, type EmailErrorCode } from "./service.ts";
import { procesarWebhookResend } from "./webhook.ts";

const A = "a64499d1-7f43-4a43-abc8-41a313dc4018";
const B = "b0000000-0000-4000-8000-000000000001";
const USER = "0c33590a-4c2a-4b32-a388-2008558688f7";

class FakeSender implements EmailSender {
  sent: OutgoingEmail[] = [];
  fail: string | null = null;
  async send(e: OutgoingEmail) {
    if (this.fail) throw new Error(this.fail);
    await new Promise((r) => setTimeout(r, 5));
    this.sent.push(e);
    return { id: `re_${this.sent.length}` };
  }
}
const config = (over: Partial<EmailConfig> = {}): EmailConfig => ({
  apiKey: "re_fake", from: "agentes@hogarmediterraneo.example", replyTo: "recepcion@abc123.resend.app", devAllowlist: [], production: false, ...over,
});
const setup = (cfg: Partial<EmailConfig> = {}) => {
  const store = new InMemoryEmailStore();
  const sender = new FakeSender();
  const deps: EmailDeps = { store, sender, config: config(cfg) };
  return { store, sender, deps };
};
const codigo = async (p: Promise<unknown>): Promise<EmailErrorCode> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof EmailError) return e.code;
    throw e;
  }
  assert.fail("debía fallar");
};

describe("política de destinatarios", () => {
  const dev = { production: false, devAllowlist: ["yo@miempresa.example"] };
  it("en desarrollo permite las direcciones de prueba de Resend (con etiqueta) y la lista blanca", () => {
    for (const a of ["delivered@resend.dev", "bounced@resend.dev", "Complained@Resend.dev", "delivered+ana@resend.dev", "yo@miempresa.example"]) {
      assert.equal(checkRecipient(a, dev).allowed, true, a);
    }
  });
  it("en desarrollo bloquea todo lo demás, incluso trucos con la dirección", () => {
    for (const a of ["laura@clinicasol.example", "delivered@resend.dev.evil.com", "x@delivered@resend.dev", "evil+delivered@resend.dev", "delivered@resend.dev,otro@x.com"]) {
      assert.equal(checkRecipient(a, dev).allowed, false, a);
    }
  });
  it("en producción permite cualquier destinatario", () => {
    assert.equal(checkRecipient("laura@clinicasol.example", { production: true, devAllowlist: [] }).allowed, true);
  });
  it("lee la lista blanca de EMAIL_DEV_ALLOWLIST", () => {
    const c = emailConfigFromEnv({ EMAIL_DEV_ALLOWLIST: " Yo@Mi.example , otro@mi.example,, ", NODE_ENV: "development" });
    assert.deepEqual(c.devAllowlist, ["yo@mi.example", "otro@mi.example"]);
    assert.equal(c.production, false);
    assert.equal(emailConfigFromEnv({ NODE_ENV: "production" }).production, true);
  });
});

describe("enviarCorreo", () => {
  it("envía un correo aprobado: remitente, dirección de respuesta, cabeceras y registro del id de Resend", async () => {
    const { store, sender, deps } = setup();
    const { email } = store.seed(A, { approved: true });
    const r = await enviarCorreo(deps, A, email.id);
    assert.equal(sender.sent.length, 1);
    const out = sender.sent[0];
    assert.equal(out.from, "Irene Soler <agentes@hogarmediterraneo.example>");
    assert.equal(out.replyTo, "recepcion@abc123.resend.app");
    assert.equal(out.to, "delivered@resend.dev");
    assert.equal(out.text, "Hola, Laura.");
    assert.match(out.headers["Message-ID"], /^<[0-9a-f-]{36}@hogarmediterraneo\.example>$/);
    assert.equal(out.idempotencyKey, `correo-${email.id}`);
    assert.equal(r.messageId, out.headers["Message-ID"]);
    const row = store.emails.find((e) => e.id === email.id)!;
    assert.deepEqual([row.deliveryStatus, row.resendId, row.messageId], ["sent", r.resendId, r.messageId]);
  });

  it("sin aprobación (pendiente o rechazada) no envía nada", async () => {
    const { store, sender, deps } = setup();
    const { email, approval } = store.seed(A);
    assert.equal(await codigo(enviarCorreo(deps, A, email.id)), "sin_aprobacion");
    approval.status = "rejected";
    assert.equal(await codigo(enviarCorreo(deps, A, email.id)), "sin_aprobacion");
    assert.equal(sender.sent.length, 0);
  });

  it("si el texto cambia tras aprobarse, no envía", async () => {
    const { store, sender, deps } = setup();
    const { email } = store.seed(A, { approved: true });
    store.emails.find((e) => e.id === email.id)!.body = "Hola, Laura. Ahora con otro precio.";
    assert.equal(await codigo(enviarCorreo(deps, A, email.id)), "texto_cambiado");
    assert.equal(sender.sent.length, 0);
  });

  it("respeta el límite diario del agente", async () => {
    const { store, sender, deps } = setup();
    const { email, thread } = store.seed(A, { approved: true, limit: 2 });
    store.addSent(thread.id, "<a@x>");
    store.addSent(thread.id, "<b@x>");
    assert.equal(await codigo(enviarCorreo(deps, A, email.id)), "limite_diario");
    assert.equal(sender.sent.length, 0);
    assert.equal(store.emails.find((e) => e.id === email.id)!.deliveryStatus, "pending_approval");
  });

  it("en desarrollo bloquea destinatarios que no son de prueba ni de la lista blanca, y deja pasar los de la lista", async () => {
    const { store, sender, deps } = setup({ devAllowlist: ["yo@miempresa.example"] });
    const real = store.seed(A, { approved: true, to: "laura@clinicasol.example" });
    assert.equal(await codigo(enviarCorreo(deps, A, real.email.id)), "destinatario_bloqueado");
    assert.equal(sender.sent.length, 0);
    const mio = store.seed(A, { approved: true, to: "yo@miempresa.example" });
    await enviarCorreo(deps, A, mio.email.id);
    assert.equal(sender.sent.length, 1);
  });

  it("en producción envía a cualquier destinatario", async () => {
    const { store, sender, deps } = setup({ production: true });
    const { email } = store.seed(A, { approved: true, to: "laura@clinicasol.example" });
    await enviarCorreo(deps, A, email.id);
    assert.equal(sender.sent[0].to, "laura@clinicasol.example");
  });

  it("exige remitente, dirección de recepción y clave", async () => {
    for (const over of [{ replyTo: null }, { from: null }, { apiKey: null }] as Partial<EmailConfig>[]) {
      const { store, deps } = setup(over);
      const { email } = store.seed(A, { approved: true });
      const d = over.apiKey === null ? { ...deps, sender: null } : deps;
      assert.equal(await codigo(enviarCorreo(d, A, email.id)), "configuracion", JSON.stringify(over));
    }
  });

  it("no envía borradores con adjuntos (aún no hay archivos reales)", async () => {
    const { store, sender, deps } = setup();
    const { email } = store.seed(A, { approved: true, attachments: true });
    assert.equal(await codigo(enviarCorreo(deps, A, email.id)), "adjuntos");
    assert.equal(sender.sent.length, 0);
  });

  it("encadena la respuesta al hilo con In-Reply-To y References", async () => {
    const { store, sender, deps } = setup();
    const { email, thread } = store.seed(A, { approved: true });
    store.addSent(thread.id, "<previo@x>", ["<raiz@x>"]);
    await enviarCorreo(deps, A, email.id);
    const h = sender.sent[0].headers;
    assert.equal(h["In-Reply-To"], "<previo@x>");
    assert.equal(h.References, "<raiz@x> <previo@x>");
    assert.deepEqual(store.emails.find((e) => e.id === email.id)!.references, ["<raiz@x>", "<previo@x>"]);
  });

  it("si Resend falla, el correo vuelve a pendiente y se puede reintentar", async () => {
    const { store, sender, deps } = setup();
    const { email } = store.seed(A, { approved: true });
    sender.fail = "Resend rechazó el envío: dominio no verificado";
    assert.equal(await codigo(enviarCorreo(deps, A, email.id)), "envio_fallido");
    const row = store.emails.find((e) => e.id === email.id)!;
    assert.deepEqual([row.deliveryStatus, row.messageId, row.resendId], ["pending_approval", null, null]);
    sender.fail = null;
    await enviarCorreo(deps, A, email.id);
    assert.equal(sender.sent.length, 1);
  });

  it("dos envíos simultáneos del mismo correo solo envían uno", async () => {
    const { store, sender, deps } = setup();
    const { email } = store.seed(A, { approved: true });
    const res = await Promise.allSettled([enviarCorreo(deps, A, email.id), enviarCorreo(deps, A, email.id)]);
    assert.equal(sender.sent.length, 1);
    assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
  });

  it("un correo ya enviado no se vuelve a enviar", async () => {
    const { store, sender, deps } = setup();
    const { email } = store.seed(A, { approved: true });
    await enviarCorreo(deps, A, email.id);
    assert.equal(await codigo(enviarCorreo(deps, A, email.id)), "ya_enviado");
    assert.equal(sender.sent.length, 1);
  });

  it("otra empresa no puede enviar el correo", async () => {
    const { store, sender, deps } = setup();
    const { email } = store.seed(A, { approved: true });
    assert.equal(await codigo(enviarCorreo(deps, B, email.id)), "no_encontrado");
    assert.equal(sender.sent.length, 0);
  });
});

describe("aprobarYEnviar (botón Aprobar)", () => {
  const input = (slug: string, over = {}) => ({ agentSlug: slug, toEmail: "delivered@resend.dev", subject: "Propuesta", body: "Hola, Laura.", ...over });

  it("aprueba con el texto editado y envía exactamente ese texto", async () => {
    const { store, sender, deps } = setup();
    const { agent, approval } = store.seed(A);
    const r = await aprobarYEnviar(deps, A, USER, input(agent.slug, { subject: "Propuesta (revisada)", body: "Hola, Laura. Texto editado." }));
    assert.equal(r.estado, "enviado");
    assert.equal(approval.status, "approved");
    assert.equal(sender.sent[0].subject, "Propuesta (revisada)");
    assert.equal(sender.sent[0].text, "Hola, Laura. Texto editado.");
  });

  it("si el envío no puede salir (destinatario bloqueado), no aprueba y el borrador sigue pendiente", async () => {
    const { store, sender, deps } = setup();
    const { agent, approval } = store.seed(A, { to: "laura@clinicasol.example" });
    const r = await aprobarYEnviar(deps, A, USER, input(agent.slug, { toEmail: "laura@clinicasol.example" }));
    assert.deepEqual([r.estado, r.estado === "no_enviado" && r.codigo], ["no_enviado", "destinatario_bloqueado"]);
    assert.equal(approval.status, "pending");
    assert.equal(sender.sent.length, 0);
  });

  it("sin borrador en la base lo dice, y no envía nada", async () => {
    const { deps, sender } = setup();
    const r = await aprobarYEnviar(deps, A, USER, input("nadie"));
    assert.deepEqual([r.estado, r.estado === "no_enviado" && r.codigo], ["no_enviado", "sin_borrador"]);
    assert.equal(sender.sent.length, 0);
  });

  it("si Resend falla tras aprobar, reintentar con el mismo texto envía; con otro texto exige aprobar de nuevo", async () => {
    const { store, sender, deps } = setup();
    const { agent } = store.seed(A);
    sender.fail = "Resend caído";
    const primero = await aprobarYEnviar(deps, A, USER, input(agent.slug));
    assert.equal(primero.estado === "no_enviado" && primero.codigo, "envio_fallido");
    sender.fail = null;
    const otroTexto = await aprobarYEnviar(deps, A, USER, input(agent.slug, { body: "Otro texto distinto" }));
    assert.equal(otroTexto.estado === "no_enviado" && otroTexto.codigo, "texto_cambiado");
    assert.equal(sender.sent.length, 0);
    const mismo = await aprobarYEnviar(deps, A, USER, input(agent.slug));
    assert.equal(mismo.estado, "enviado");
  });

  it("otra empresa no encuentra el borrador", async () => {
    const { store, deps } = setup();
    const { agent } = store.seed(A);
    const r = await aprobarYEnviar(deps, B, USER, input(agent.slug));
    assert.equal(r.estado === "no_enviado" && r.codigo, "sin_borrador");
  });
});

describe("avisos de entrega", () => {
  const enviado = async () => {
    const ctx = setup();
    const seeded = ctx.store.seed(A, { approved: true });
    const { resendId } = await enviarCorreo(ctx.deps, A, seeded.email.id);
    const row = () => ctx.store.emails.find((e) => e.id === seeded.email.id)!.deliveryStatus;
    return { ...ctx, ...seeded, resendId, row };
  };
  const ev = (type: string, id: string, extra = {}) => ({ type, data: { email_id: id, ...extra } });

  it("entregado, rebotado y spam actualizan el correo y el hilo", async () => {
    const { store, resendId, row, thread } = await enviado();
    assert.equal((await registrarEntrega(store, ev("email.delivered", resendId))).estado, "actualizado");
    assert.deepEqual([row(), thread.status], ["delivered", "delivered"]);
    const spam = await registrarEntrega(store, ev("email.complained", resendId));
    assert.equal(spam.estado, "actualizado");
    assert.deepEqual([row(), thread.status, thread.note], ["complained", "complained", "El destinatario lo marcó como spam"]);
  });

  it("un rebote devuelve los datos para anotarlo en la memoria y guarda el motivo", async () => {
    const { store, resendId, row, thread, contact, agent } = await enviado();
    const r = await registrarEntrega(store, ev("email.bounced", resendId, { bounce: { message: "Mailbox does not exist" } }));
    assert.equal(row(), "bounced");
    assert.equal(thread.note, "Rebotó: Mailbox does not exist");
    assert.deepEqual(r.rebote && [r.rebote.contactId, r.rebote.agentId, r.rebote.companyId, r.rebote.contactEmail], [contact.id, agent.id, A, contact.email]);
  });

  it("un aviso tardío o repetido no deshace un rebote", async () => {
    const { store, resendId, row } = await enviado();
    await registrarEntrega(store, ev("email.bounced", resendId));
    assert.equal((await registrarEntrega(store, ev("email.delivered", resendId))).estado, "sin_cambios");
    assert.equal(row(), "bounced");
    const repetido = await registrarEntrega(store, ev("email.bounced", resendId));
    assert.equal(repetido.estado, "sin_cambios");
    assert.ok(repetido.rebote, "el rebote repetido se devuelve para completar lo que falló la primera vez");
  });

  it("un hilo ya respondido conserva su estado", async () => {
    const { store, resendId, row, thread } = await enviado();
    thread.status = "replied";
    await registrarEntrega(store, ev("email.delivered", resendId));
    assert.deepEqual([row(), thread.status], ["delivered", "replied"]);
  });

  it("ignora eventos que no cambian el estado y los correos desconocidos", async () => {
    const { store, resendId, row } = await enviado();
    assert.equal((await registrarEntrega(store, ev("email.opened", resendId))).estado, "ignorado");
    assert.equal((await registrarEntrega(store, ev("email.delivered", "re_desconocido"))).estado, "desconocido");
    assert.equal(row(), "sent");
  });
});

describe("webhook de Resend", () => {
  const SECRET = `whsec_${Buffer.from("secreto-de-prueba-0123456789").toString("base64")}`;
  const sign = (payload: object, over: { id?: string; ts?: Date; secret?: string } = {}) => {
    const body = JSON.stringify(payload);
    const id = over.id ?? "msg_1";
    const ts = over.ts ?? new Date();
    const sig = new Webhook(over.secret ?? SECRET).sign(id, ts, body);
    const headers = new Headers({ "svix-id": id, "svix-timestamp": String(Math.floor(ts.getTime() / 1000)), "svix-signature": sig });
    return { body, headers };
  };
  // Se firma el cuerpo con el id real de Resend: primero se envía para conocerlo.
  const firmado = async (type: string, extra = {}, over = {}) => {
    const ctx = setup();
    const seeded = ctx.store.seed(A, { approved: true });
    const { resendId } = await enviarCorreo(ctx.deps, A, seeded.email.id);
    const { body, headers } = sign({ type, data: { email_id: resendId, ...extra } }, over);
    return { ctx, seeded, body, headers };
  };
  const procesar = (f: Awaited<ReturnType<typeof firmado>>, rebotes: unknown[] = [], opts: { secret?: string | null; fallo?: boolean } = {}) =>
    procesarWebhookResend({
      secret: opts.secret === undefined ? SECRET : opts.secret,
      rawBody: f.body,
      headers: f.headers,
      store: f.ctx.store,
      alRebotar: async (r) => {
        if (opts.fallo) throw new Error("memoria caída");
        rebotes.push(r);
      },
    });

  it("con firma válida actualiza el estado", async () => {
    const f = await firmado("email.delivered");
    const res = await procesar(f);
    assert.deepEqual([res.status, res.body.estado], [200, "actualizado"]);
    assert.equal(f.ctx.store.emails.find((e) => e.id === f.seeded.email.id)!.deliveryStatus, "delivered");
  });

  it("rechaza (400) firma falsa, cuerpo manipulado, cabeceras ausentes y avisos caducados, sin tocar nada", async () => {
    const f = await firmado("email.delivered");
    const estado = () => f.ctx.store.emails.find((e) => e.id === f.seeded.email.id)!.deliveryStatus;

    const otraClave = sign(JSON.parse(f.body), { secret: `whsec_${Buffer.from("otra-clave-distinta-000000").toString("base64")}` });
    assert.equal((await procesar({ ...f, ...otraClave })).status, 400);

    const manipulado = { ...f, body: f.body.replace("email.delivered", "email.bounced") };
    assert.equal((await procesar(manipulado)).status, 400);

    assert.equal((await procesar({ ...f, headers: new Headers() })).status, 400);

    const viejo = sign(JSON.parse(f.body), { ts: new Date(Date.now() - 60 * 60 * 1000) });
    assert.equal((await procesar({ ...f, ...viejo })).status, 400);

    assert.equal(estado(), "sent", "ninguna petición rechazada cambió el correo");
  });

  it("sin secreto configurado responde 503 y no procesa", async () => {
    const f = await firmado("email.delivered");
    assert.equal((await procesar(f, [], { secret: null })).status, 503);
    assert.equal(f.ctx.store.emails.find((e) => e.id === f.seeded.email.id)!.deliveryStatus, "sent");
  });

  it("un rebote anota el correo no válido; si la anotación falla responde 500 para que Resend reintente", async () => {
    const f = await firmado("email.bounced", { bounce: { message: "No such user" } });
    const rebotes: unknown[] = [];
    const roto = await procesar(f, rebotes, { fallo: true });
    assert.equal(roto.status, 500);
    assert.equal(rebotes.length, 0);
    const reintento = await procesar(f, rebotes);
    assert.equal(reintento.status, 200);
    assert.equal(rebotes.length, 1, "el reintento completa la anotación aunque el estado ya estaba actualizado");
  });

  it("un cuerpo firmado pero mal formado responde 400", async () => {
    const { body, headers } = sign({ type: 123, data: {} });
    const res = await procesarWebhookResend({ secret: SECRET, rawBody: body, headers, store: new InMemoryEmailStore(), alRebotar: async () => {} });
    assert.equal(res.status, 400);
  });
});
