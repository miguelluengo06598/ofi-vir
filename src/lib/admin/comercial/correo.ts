/**
 * Correo de bienvenida del alta (Resend, en español y con la marca). SOLO SERVIDOR.
 * Al propietario: enlace de invitación, qué va a pasar ahora y quién es su responsable en MyOfia.
 * Al resto de miembros: su invitación a la oficina.
 */
import { Resend } from "resend";
import type { EmailConfig } from "@/lib/email/config";

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export type DatosBienvenida = {
  para: string; empresa: string; nombre: string | null; enlace: string; propietario: boolean;
  responsable: { nombre: string; email: string | null }; pasos: string[];
};

export function componerBienvenida(d: DatosBienvenida) {
  const saludo = d.nombre ? `Hola, ${d.nombre.split(" ")[0]}:` : "Hola:";
  const asunto = d.propietario ? `Bienvenido a tu oficina virtual, ${d.empresa}` : `Te han invitado a la oficina de ${d.empresa}`;
  const intro = d.propietario
    ? `Ya hemos creado la oficina de ${d.empresa}. Estamos preparando tus departamentos y tus agentes; mientras tanto, puedes entrar y ver cómo va.`
    : `Te han invitado a la oficina virtual de ${d.empresa}.`;
  const pasos = d.propietario ? d.pasos : [];
  const contacto = d.responsable.email ? `${d.responsable.nombre} (${d.responsable.email})` : d.responsable.nombre;

  const texto = [
    saludo, "", intro, "", `Entra con este enlace (caduca en 7 días): ${d.enlace}`, "",
    ...(pasos.length ? ["Lo que te toca a ti:", ...pasos.map((p) => `- ${p}`), ""] : []),
    ...(d.propietario ? ["Qué va a pasar ahora: configuramos tus agentes, los probamos contigo y los certificamos antes de que trabajen con clientes reales.", "", `Tu responsable en MyOfia: ${contacto}.`, ""] : []),
    "MyOfia · Tu equipo de IA por departamentos",
  ].join("\n");

  const html = `<div style="font-family:Poppins,Arial,sans-serif;background:#0f1320;color:#fff;padding:32px">
  <div style="max-width:560px;margin:auto;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:24px;padding:32px">
    <p style="color:#b9c4d6;margin:0 0 16px">MyOfia</p>
    <h1 style="font-size:24px;margin:0 0 12px">${esc(asunto)}</h1>
    <p>${esc(saludo)}</p><p>${esc(intro)}</p>
    <p style="margin:28px 0"><a href="${esc(d.enlace)}" style="background:#fff;color:#0f1320;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700">Entrar en mi oficina</a></p>
    <p style="color:#b9c4d6;font-size:13px">El enlace caduca en 7 días y solo sirve para ${esc(d.para)}.</p>
    ${pasos.length ? `<h2 style="font-size:17px;margin-top:28px">Lo que te toca a ti</h2><ul>${pasos.map((p) => `<li style="margin:6px 0">${esc(p)}</li>`).join("")}</ul>` : ""}
    ${d.propietario ? `<h2 style="font-size:17px;margin-top:28px">Qué va a pasar ahora</h2><p>Configuramos tus agentes, los probamos contigo y los certificamos antes de que trabajen con clientes reales. Lo importante siempre lo apruebas tú.</p><p>Tu responsable en MyOfia: <strong>${esc(contacto)}</strong>.</p>` : ""}
    <p style="color:#b9c4d6;font-size:12px;margin-top:28px">Si no esperabas este correo, puedes ignorarlo.</p>
  </div></div>`;
  return { asunto, texto, html };
}

export async function correoBienvenida(config: EmailConfig, d: DatosBienvenida): Promise<void> {
  const { asunto, texto, html } = componerBienvenida(d);
  const r = await new Resend(config.apiKey!).emails.send({ from: config.from!, to: d.para, replyTo: config.replyTo ?? undefined, subject: asunto, text: texto, html });
  if (r.error) throw new Error(r.error.message);
}
