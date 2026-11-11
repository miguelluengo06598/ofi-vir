/**
 * 7. Panel interno /admin/certificacion: solo el equipo revisor (`revisor_samgple` / `admin_samgple` en `reviewers`).
 * Por HTTP contra el servidor de desarrollo real, con sesiones reales.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { admin, COMPANY_A, createUser, loginAs, RUN } from "./entorno.ts";
import { altaEnEmpresa } from "../ayuda/miembros.ts";

const BASE = process.env.SEC_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
const alcanzable = await fetch(`${BASE}/api/admin/margenes`, { signal: AbortSignal.timeout(60_000) }).then(() => true, () => false);
const skip = alcanzable ? false : `No hay servidor en ${BASE}: arranca \`npm run dev\`.`;
const SARA = "5a4a0000-0000-4000-8000-0000000000c1";   // solicitud de prueba (si están los datos de prueba del panel)
const RUTAS = ["/admin/certificacion", "/admin/certificacion/metricas", `/admin/certificacion/${SARA}`];

let tokenPropietario = "", tokenAdminMargenes = "", tokenRevisor = "", tokenBaja = "";
const creados: string[] = [];
const pedir = (ruta: string, token?: string) => fetch(`${BASE}${ruta}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(90_000) });

async function persona(etiqueta: string): Promise<{ id: string; token: string }> {
  const email = `sec-cert-${etiqueta}-${RUN}@test.example`, password = `Pw-${RUN}-${etiqueta}-Aa1!`;
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  creados.push(data.user!.id);
  return { id: data.user!.id, token: (await (await loginAs(email, password)).auth.getSession()).data.session!.access_token };
}

before(async () => {
  if (skip) return;
  const dueno = await createUser(COMPANY_A, "owner", "cert-owner");
  tokenPropietario = (await dueno.client.auth.getSession()).data.session!.access_token;
  // Administrador de una EMPRESA (sin rol de plataforma): no es del equipo de MyOfia.
  const m = await persona("margenes");
  assert.ifError((await altaEnEmpresa(admin, { id: m.id, companyId: COMPANY_A, nombre: "Prueba admin de empresa", email: `sec-cert-margenes-${RUN}@test.example`, rol: "admin" })).error);
  tokenAdminMargenes = m.token;
  const r = await persona("revisor");
  assert.ifError((await admin.from("reviewers").insert({ user_id: r.id, rol: "revisor_samgple", nombre: `Seguridad ${RUN}`, categorias: ["atencion"] })).error);
  tokenRevisor = r.token;
  const b = await persona("baja");
  assert.ifError((await admin.from("reviewers").insert({ user_id: b.id, rol: "revisor_samgple", nombre: `Baja ${RUN}`, categorias: ["atencion"], activo: false })).error);
  tokenBaja = b.token;
});
after(async () => {
  for (const id of creados) { await admin.from("reviewers").delete().eq("user_id", id); await admin.auth.admin.deleteUser(id); }
});

describe("panel interno de certificación", { skip }, () => {
  for (const ruta of RUTAS) {
    it(`${ruta}: una empresa cliente, un token falso, un admin de márgenes y un revisor dado de baja reciben 404`, async () => {
      assert.equal((await pedir(ruta, tokenPropietario)).status, 404, "propietario de una empresa");
      assert.equal((await pedir(ruta, "no-es-un-jwt")).status, 404, "token falso");
      assert.equal((await pedir(ruta, tokenAdminMargenes)).status, 404, "un administrador de empresa no es del equipo de MyOfia");
      assert.equal((await pedir(ruta, tokenBaja)).status, 404, "revisor inactivo");
    });
  }
  it("el 404 no revela nada del panel", async () => {
    const cuerpo = await (await pedir("/admin/certificacion", tokenPropietario)).text();
    for (const pista of ["Cola de revisión", "MyOfia", "revisor", "Sara"]) assert.ok(!cuerpo.includes(pista), `no aparece «${pista}»`);
  });
  it("un revisor entra en el panel de certificación, pero no en el de márgenes", async () => {
    const r = await pedir("/admin/certificacion", tokenRevisor);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Cola de revisión/);
    assert.equal((await pedir("/admin/certificacion/metricas", tokenRevisor)).status, 200);
    assert.equal((await pedir("/admin/margenes", tokenRevisor)).status, 404);
    assert.equal((await pedir("/api/admin/margenes", tokenRevisor)).status, 404);
  });
  it("una solicitud que no existe no enseña nada, tampoco al revisor", async () => {
    // La página ya ha empezado a enviarse cuando se sabe que no existe: el estado puede ser 200, pero el contenido es «no encontrado».
    for (const id of ["00000000-0000-4000-8000-000000000000", "no-es-un-id"]) {
      const cuerpo = await (await pedir(`/admin/certificacion/${id}`, tokenRevisor)).text();
      assert.ok(!cuerpo.includes("Lista de comprobación") && !cuerpo.includes("Ficha del agente"), "sin vista de revisión");
    }
  });
  it("con su sesión, la empresa tampoco lee las tablas del panel (RLS)", async () => {
    const dueno = await loginAsPropietario();
    for (const tabla of ["reviewers", "certification_reviews", "template_review_requests", "template_reviews"]) {
      const r = await dueno.from(tabla).select("*").limit(1);
      assert.ok(r.error || (r.data ?? []).length === 0, `${tabla} no se puede leer`);
    }
    // Sí ve sus propias solicitudes, pero no quién la revisa por dentro ni las notas: esas viven en certification_reviews.
    const propias = await dueno.from("certification_requests").select("id, company_id").limit(50);
    assert.ok((propias.data ?? []).every((x) => x.company_id === COMPANY_A));
  });
});

async function loginAsPropietario() {
  const u = await createUser(COMPANY_A, "owner", "cert-owner-rls");
  return u.client;
}
