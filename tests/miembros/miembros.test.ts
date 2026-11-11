/**
 * Miembros, roles y aislamiento entre empresas contra la base LOCAL, con sesiones REALES de Supabase Auth (JWT) y la RLS de verdad.
 *  - Un miembro de la empresa A no ve NADA de la empresa B: barrido de TODAS las tablas y vistas con company_id.
 *  - Una persona en dos empresas ve las dos; desactivada o con la empresa suspendida, nada.
 *  - Ser admin_samgple no da acceso a ninguna empresa.
 *  - Permisos de gestión (miembros, invitaciones, propietario) y empresa activa verificada en el servidor.
 * Ejecutar: npm run test:miembros (con `supabase start`).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  aceptarInvitacionHandler, empresaActivaPostHandler, invitacionesPostHandler, miembroPostHandler, propietarioPostHandler, type DepsEmpresas,
} from "../../src/lib/empresas/api.ts";
import { autenticadorSupabase, identificadorPersona } from "../../src/lib/empresas/sesion.ts";
import { clienteLocal } from "../ayuda/clienteLocal.ts";
import { altaEnEmpresa, rolDePlataforma } from "../ayuda/miembros.ts";

const { db, url } = clienteLocal();
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const RUN = Date.now().toString(36);
// Empresa B = la del seed (Hogar Mediterráneo): tiene datos en casi todas las tablas.
const B = "a64499d1-7f43-4a43-abc8-41a313dc4018";
const creados: string[] = [];
after(async () => { for (const id of creados) await db.auth.admin.deleteUser(id).catch(() => undefined); });

const psql = (sql: string) => execFileSync("docker", ["exec", "supabase_db_oficina-virtual", "psql", "-U", "postgres", "-At", "-c", sql], { encoding: "utf8" }).trim();

type Persona = { id: string; email: string; client: SupabaseClient; token: string };
async function persona(etiqueta: string): Promise<Persona> {
  const email = `miembros-${etiqueta}-${RUN}@test.example`, password = `Pw-${RUN}-${etiqueta}-Aa1!`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  creados.push(data.user!.id);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.ifError(s.error);
  return { id: data.user!.id, email, client, token: s.data.session!.access_token };
}
async function empresa(nombre: string) {
  const id = randomUUID();
  assert.ifError((await db.from("companies").insert({ id, name: `${nombre} ${RUN}`, sector: "Pruebas" })).error);
  assert.ifError((await db.from("contacts").insert({ company_id: id, name: `Contacto de ${nombre}`, email: `c-${id.slice(0, 6)}@x.example` })).error);
  return id;
}
async function alta(p: Persona, companyId: string, rol: string, puedeAprobar = false) {
  assert.ifError((await altaEnEmpresa(db, { id: p.id, companyId, nombre: `Prueba ${rol}`, email: p.email, rol, puedeAprobar })).error);
}
/** Todas las tablas y vistas de public con columna company_id (lo que la RLS debe aislar). */
const tablasConEmpresa = () => psql(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'company_id' order by 1`).split("\n").filter(Boolean);

let A = "", miembroA: Persona, propietariaA: Persona, adminA: Persona, samgple: Persona, doble: Persona;
before(async () => {
  A = await empresa("Empresa A");
  miembroA = await persona("miembro-a"); propietariaA = await persona("propietaria-a"); adminA = await persona("admin-a");
  samgple = await persona("samgple"); doble = await persona("doble");
  await alta(miembroA, A, "miembro");
  await alta(propietariaA, A, "propietario");
  await alta(adminA, A, "admin");
  assert.ifError((await rolDePlataforma(db, { id: samgple.id, nombre: "MyOfia", email: samgple.email, rol: "admin_samgple" })).error);
  await alta(doble, A, "miembro");
  await alta(doble, B, "miembro");
});

describe("aislamiento entre empresas con la RLS real", () => {
  it("un miembro de la empresa A no ve NADA de la empresa B (todas las tablas y vistas con company_id)", async () => {
    const tablas = tablasConEmpresa();
    assert.ok(tablas.length >= 40, `se barren ${tablas.length} tablas y vistas`);
    const conDatosDeB: string[] = [];
    const vistas: string[] = [];
    for (const t of tablas) {
      const { data, error } = await miembroA.client.from(t).select("company_id").limit(1000);
      if (error) { vistas.push(`${t}: sin acceso (${error.code})`); continue; }   // sin permiso de lectura: tampoco ve nada
      if ((data ?? []).some((f) => f.company_id !== A)) conDatosDeB.push(t);
      // Y pidiendo expresamente B:
      const { data: deB } = await miembroA.client.from(t).select("company_id").eq("company_id", B).limit(1);
      if ((deB ?? []).length) conDatosDeB.push(`${t} (filtrando por B)`);
    }
    assert.deepEqual(conDatosDeB, [], "ninguna fila de otra empresa");
    // Comprobación de control: la empresa B sí tiene datos en esas tablas (el barrido no pasa por estar vacías).
    const conFilasEnB = tablas.filter((t) => Number(psql(`select count(*) from public."${t}" where company_id = '${B}'`)) > 0);
    assert.ok(conFilasEnB.length >= 15, `B tiene datos en ${conFilasEnB.length} tablas`);
    // Y A sí ve lo suyo.
    assert.equal((await miembroA.client.from("contacts").select("id")).data?.length, 1);
    assert.equal((await miembroA.client.from("companies").select("id")).data?.map((c) => c.id).join(), A);
  });

  it("tampoco ve los perfiles, miembros ni invitaciones de B; los de A sí", async () => {
    const { data: perfiles } = await miembroA.client.from("users").select("id");
    const ids = new Set((perfiles ?? []).map((p) => p.id));
    assert.ok(ids.has(propietariaA.id) && ids.has(miembroA.id));
    assert.ok(!ids.has("0c33590a-4c2a-4b32-a388-2008558688f7"), "no ve a Marcos (propietario de B)");
    const { data: miembros } = await miembroA.client.from("company_members").select("company_id, user_id");
    assert.ok((miembros ?? []).every((m) => m.company_id === A));
    assert.deepEqual((await miembroA.client.from("company_invitations").select("id")).data, [], "un miembro no ve invitaciones");
    assert.deepEqual((await miembroA.client.from("platform_roles").select("user_id")).data, [], "ni roles de plataforma ajenos");
  });

  it("no puede escribir en B ni hacerse miembro de B; contactos y memoria: un miembro solo lee", async () => {
    assert.ok((await miembroA.client.from("contacts").insert({ company_id: B, name: "Intruso", email: "i@x.example" })).error);
    assert.ok((await miembroA.client.from("company_members").insert({ company_id: B, user_id: miembroA.id, rol: "propietario" })).error);
    assert.ok((await miembroA.client.from("contacts").insert({ company_id: A, name: "Nuevo", email: "n@x.example" })).error, "el miembro no escribe contactos");
    assert.ifError((await propietariaA.client.from("contacts").insert({ company_id: A, name: "De la propietaria", email: `p-${RUN}@x.example` })).error);
    const { data } = await miembroA.client.from("company_members").update({ rol: "propietario" }).eq("user_id", miembroA.id).select();
    assert.deepEqual(data ?? [], [], "no se cambia el rol");
  });

  it("una persona de dos empresas ve las dos; si la desactivan en B, deja de ver B al momento", async () => {
    const ver = async () => new Set(((await doble.client.from("companies").select("id")).data ?? []).map((c) => c.id));
    assert.deepEqual(await ver(), new Set([A, B]));
    assert.ifError((await db.from("company_members").update({ estado: "desactivado" }).eq("company_id", B).eq("user_id", doble.id)).error);
    assert.deepEqual(await ver(), new Set([A]));
    assert.deepEqual((await doble.client.from("contacts").select("id").eq("company_id", B)).data, []);
  });

  it("una empresa suspendida no da acceso a sus miembros", async () => {
    const S = await empresa("Suspendida");
    const p = await persona("suspendida");
    await alta(p, S, "propietario");
    assert.equal((await p.client.from("contacts").select("id")).data?.length, 1);
    assert.ifError((await db.from("companies").update({ estado: "suspendida" }).eq("id", S)).error);
    assert.deepEqual((await p.client.from("contacts").select("id")).data, []);
  });

  it("ser admin_samgple no da acceso a los datos de ninguna empresa", async () => {
    for (const t of ["companies", "contacts", "tasks", "memory_nodes", "emails", "credit_ledger"]) {
      assert.deepEqual((await samgple.client.from(t).select("company_id").limit(5)).data ?? [], [], t);
    }
    assert.equal((await samgple.client.from("platform_roles").select("rol")).data?.[0]?.rol, "admin_samgple", "solo ve su propio rol");
  });
});

describe("gestión de miembros e invitaciones (servidor)", () => {
  const deps = (): DepsEmpresas => ({ db, autenticar: autenticadorSupabase(db, {}), persona: identificadorPersona(db, {}), appUrl: "http://localhost:3000", produccion: false, enviarInvitacion: async () => undefined });
  const req = (p: Persona, cuerpo?: unknown, empresaCookie?: string) => new Request("http://x", {
    method: "POST", body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    headers: { authorization: `Bearer ${p.token}`, ...(empresaCookie ? { cookie: `empresa_activa=${empresaCookie}` } : {}) },
  });

  it("la empresa activa: solo una de la que eres miembro; el cliente no puede colarse en otra", async () => {
    const a = await empresaActivaPostHandler(req(doble, { companyId: A }), deps());
    assert.equal(a.status, 200);
    assert.match(a.headers.get("set-cookie") ?? "", /empresa_activa=.*HttpOnly/);
    assert.equal((await empresaActivaPostHandler(req(miembroA, { companyId: B }), deps())).status, 404, "no es miembro de B");
    // Aunque mande la cookie de B, su sesión sigue en A.
    const s = await autenticadorSupabase(db, {})(req(miembroA, undefined, B));
    assert.equal(s?.companyId, A);
    assert.equal(s?.rol, "miembro");
  });

  it("un miembro no gestiona miembros ni invita; un admin no toca al propietario ni nombra propietarios", async () => {
    assert.equal((await invitacionesPostHandler(req(miembroA, { email: "x@y.example", rol: "miembro" }), deps())).status, 403);
    assert.equal((await miembroPostHandler(req(miembroA, { rol: "admin" }), adminA.id, deps())).status, 403);
    assert.equal((await miembroPostHandler(req(adminA, { estado: "desactivado" }), propietariaA.id, deps())).status, 403, "el admin no toca al propietario");
    assert.equal((await miembroPostHandler(req(adminA, { rol: "propietario" }), miembroA.id, deps())).status, 400, "propietario no es un rol asignable");
    assert.equal((await propietarioPostHandler(req(adminA, { userId: adminA.id }), deps())).status, 403, "solo el propietario transfiere");
    assert.equal((await miembroPostHandler(req(adminA, { puedeAprobar: true }), miembroA.id, deps())).status, 200, "el admin sí da permiso de aprobar");
    assert.equal((await db.from("company_members").select("puede_aprobar").eq("company_id", A).eq("user_id", miembroA.id).single()).data?.puede_aprobar, true);
  });

  it("invitación: token aleatorio de un solo uso, solo para su correo y con caducidad; en la base solo queda la huella", async () => {
    const invitada = await persona("invitada");
    const r = await invitacionesPostHandler(req(adminA, { email: invitada.email, rol: "miembro" }), deps());
    assert.equal(r.status, 201);
    const { token, id } = (await r.json()) as { token: string; id: string };
    const fila = (await db.from("company_invitations").select("*").eq("id", id).single()).data!;
    assert.notEqual(fila.token_hash, token);
    assert.ok(!JSON.stringify(fila).includes(token), "el token no se guarda");
    assert.ok(new Date(fila.caduca_en).getTime() - Date.now() > 6.9 * 86_400_000, "caduca a los 7 días");
    assert.equal((await aceptarInvitacionHandler(req(miembroA, { token }), deps())).status, 403, "otra persona no puede usarla");
    assert.equal((await aceptarInvitacionHandler(req(invitada, { token }), deps())).status, 200);
    assert.equal((await aceptarInvitacionHandler(req(invitada, { token }), deps())).status, 400, "de un solo uso");
    assert.equal((await invitada.client.from("companies").select("id")).data?.[0]?.id, A, "ya es miembro de A");
    // Caducada: no vale.
    const otra = await persona("caducada");
    const r2 = (await (await invitacionesPostHandler(req(propietariaA, { email: otra.email, rol: "admin" }), deps())).json()) as { token: string; id: string };
    await db.from("company_invitations").update({ caduca_en: new Date(Date.now() - 1000).toISOString() }).eq("id", r2.id);
    assert.equal((await aceptarInvitacionHandler(req(otra, { token: r2.token }), deps())).status, 400);
    // No se invita como propietario.
    assert.equal((await invitacionesPostHandler(req(propietariaA, { email: "z@y.example", rol: "propietario" }), deps())).status, 400);
  });

  it("el propietario transfiere la propiedad: pasa a admin y solo hay un propietario", async () => {
    assert.equal((await propietarioPostHandler(req(propietariaA, { userId: adminA.id }), deps())).status, 200);
    const roles = Object.fromEntries(((await db.from("company_members").select("user_id, rol").eq("company_id", A)).data ?? []).map((m) => [m.user_id, m.rol]));
    assert.equal(roles[adminA.id], "propietario");
    assert.equal(roles[propietariaA.id], "admin");
    assert.equal(Object.values(roles).filter((r) => r === "propietario").length, 1);
  });
});
