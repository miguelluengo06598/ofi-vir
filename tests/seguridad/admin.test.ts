/** 6. Panel interno /admin/margenes: solo el rol admin_idesie. Por HTTP contra el servidor de desarrollo real. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { admin, COMPANY_A, createUser, loginAs, RUN } from "./entorno.ts";

const BASE = process.env.SEC_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
const alcanzable = await fetch(`${BASE}/api/admin/margenes`, { signal: AbortSignal.timeout(60_000) }).then(() => true, () => false);
const skip = alcanzable ? false : `No hay servidor en ${BASE}: arranca \`npm run dev\`.`;

let tokenPropietario = "", tokenAdmin = "", idAdmin = "";
const pedir = (ruta: string, token?: string) =>
  fetch(`${BASE}${ruta}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(60_000) });

before(async () => {
  if (skip) return;
  const dueno = await createUser(COMPANY_A, "owner", "adm-owner");
  tokenPropietario = (await dueno.client.auth.getSession()).data.session!.access_token;
  const email = `sec-adm-idesie-${RUN}@test.example`, password = `Pw-${RUN}-idesie-Aa1!`;
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  idAdmin = data.user!.id;
  assert.ifError((await admin.from("users").insert({ id: idAdmin, company_id: COMPANY_A, full_name: "Prueba idesie", email, role: "admin_idesie" })).error);
  tokenAdmin = (await (await loginAs(email, password)).auth.getSession()).data.session!.access_token;
});
after(async () => { if (idAdmin) await admin.auth.admin.deleteUser(idAdmin); });

describe("panel interno de márgenes", { skip }, () => {
  for (const ruta of ["/admin/margenes", "/api/admin/margenes"]) {
    it(`${ruta}: el propietario de una empresa cliente y un token falso reciben 404`, async () => {
      assert.equal((await pedir(ruta, tokenPropietario)).status, 404);
      assert.equal((await pedir(ruta, "no-es-un-jwt")).status, 404);
    });
    it(`${ruta}: el rol admin_idesie entra`, async () => {
      const r = await pedir(ruta, tokenAdmin);
      assert.equal(r.status, 200);
      if (ruta.startsWith("/api")) assert.ok(Array.isArray((await r.json()).porEmpresaMes));
    });
  }
  it("un mes con formato inválido se rechaza (400) sin romper nada", async () => {
    assert.equal((await pedir("/api/admin/margenes?mes=2026-99", tokenAdmin)).status, 400);
  });
  it("la respuesta del admin no incluye datos de contenido de las empresas (correos, contactos, memoria)", async () => {
    const texto = await (await pedir("/api/admin/margenes", tokenAdmin)).text();
    for (const clave of ["email", "contact", "memory", "body", "asunto"]) assert.ok(!texto.toLowerCase().includes(`"${clave}`), `aparece «${clave}»`);
  });
});
