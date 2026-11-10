/**
 * Clientes en el panel de SAMGPLE contra la base LOCAL: listado y salud, permisos por rol, créditos (regalo y ajuste),
 * pausa/suspensión/reactivación, ficha, datos fiscales, invitaciones, cambio de propietario, exportación y borrado.
 * Las acciones se llaman al servicio con una sesión de plataforma ya verificada (la MFA y el 404 del proxy se prueban en
 * tests/seguridad/admin.test.ts). Ejecutar: npm run test:admin
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { RolPlataforma, SesionPlataforma } from "../../src/lib/admin/acceso.ts";
import { cambioPropietarioPostHandler, exportacionDescargaHandler } from "../../src/lib/admin/clientes/empresa.ts";
import { BUCKET_EXPORTACIONES, enlaceDeDescarga, generarExportacion } from "../../src/lib/admin/clientes/exportar.ts";
import { obtenerClientes } from "../../src/lib/admin/clientes/listado.ts";
import * as s from "../../src/lib/admin/clientes/servicio.ts";
import { SupabaseAgentStore } from "../../src/lib/agents/supabaseStore.ts";
import type { Sesion } from "../../src/lib/empresas/sesion.ts";
import { altaEnEmpresa } from "../ayuda/miembros.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);
const db = createClient(url, key, { auth: { persistSession: false } });
const RUN = Date.now().toString(36);

const usuarios: string[] = [];
async function persona(etiqueta: string) {
  const email = `cli-${etiqueta}-${RUN}@test.example`, password = `Pw-${RUN}-${etiqueta}-Aa1!`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  usuarios.push(data.user!.id);
  return { id: data.user!.id, email, password };
}
async function samgple(etiqueta: string, roles: RolPlataforma[]): Promise<s.Contexto> {
  const p = await persona(etiqueta);
  assert.ifError((await db.from("users").upsert({ id: p.id, full_name: etiqueta, email: p.email })).error);
  assert.ifError((await db.from("platform_roles").insert({ user_id: p.id, rol: roles[0], roles, nombre: `SAMGPLE ${etiqueta}`, categorias: ["ventas"] })).error);
  const sesion: SesionPlataforma = { userId: p.id, roles, nombre: etiqueta, categorias: [], mfaVerificada: true };
  return { db, sesion, ip: "127.0.0.1" };
}
const motivo = "Prueba automática del panel de clientes";
const auditoria = async (companyId: string, accion: string) =>
  (await db.from("admin_audit_log").select("accion, motivo, antes, despues").eq("company_id", companyId).eq("accion", accion).order("creado_en", { ascending: false })).data ?? [];

let C = "", NOMBRE = "";
let admin: s.Contexto, finanzas: s.Contexto, comercial: s.Contexto, soporte: s.Contexto;
let duena: { id: string; email: string; password: string }, ana: { id: string; email: string; password: string }, compartida: { id: string; email: string; password: string };
let OTRA = "";

before(async () => {
  C = randomUUID(); OTRA = randomUUID(); NOMBRE = `test-cli Empresa ${RUN}`;
  assert.ifError((await db.from("companies").insert([{ id: C, name: NOMBRE, sector: "Pruebas" }, { id: OTRA, name: `test-cli Otra ${RUN}` }])).error);
  duena = await persona("duena"); ana = await persona("ana"); compartida = await persona("compartida");
  assert.ifError((await altaEnEmpresa(db, { id: duena.id, companyId: C, nombre: "Dueña", email: duena.email, rol: "propietario" })).error);
  assert.ifError((await altaEnEmpresa(db, { id: ana.id, companyId: C, nombre: "Ana", email: ana.email, rol: "miembro" })).error);
  // Una persona que también es de otra empresa: su cuenta NO se borra con la empresa.
  assert.ifError((await altaEnEmpresa(db, { id: compartida.id, companyId: C, nombre: "Compartida", email: compartida.email, rol: "admin" })).error);
  assert.ifError((await altaEnEmpresa(db, { id: compartida.id, companyId: OTRA, nombre: "Compartida", email: compartida.email, rol: "propietario" })).error);

  admin = await samgple("admin", ["admin_samgple"]);
  finanzas = await samgple("finanzas", ["finanzas_samgple"]);
  comercial = await samgple("comercial", ["comercial_samgple"]);
  soporte = await samgple("soporte", ["soporte_samgple"]);

  // Datos de la empresa que el borrado debe eliminar (y la exportación incluir).
  const dep = (await db.from("departments").insert({ company_id: C, slug: "ventas", name: "Ventas" }).select("id").single()).data!.id as string;
  const ag = (await db.from("agents").insert({ company_id: C, department_id: dep, slug: `ag-${RUN}`, name: "Agente Prueba", role: "SDR", creator_name: "x", model: "claude-haiku-5-5", allowed_tools: [], instructions: "x" }).select("id").single()).data!.id as string;
  assert.ifError((await db.from("agent_versions").insert({ company_id: C, agent_id: ag, version: 1, snapshot: { nombre: "Agente Prueba" } })).error);
  const contacto = (await db.from("contacts").insert({ company_id: C, name: "Cliente Final", email: `final-${RUN}@cliente.example` }).select("id").single()).data!.id as string;
  assert.ifError((await db.from("memory_nodes").insert({ company_id: C, contact_id: contacto, node_type: "dato", title: "Prefiere llamadas por la tarde", created_by_user_id: duena.id })).error);
  assert.ifError((await db.rpc("anadir_lote", { p_company_id: C, p_origen: "pack", p_pack_id: "inicio", p_creditos: null, p_dias_caducidad: null, p_referencia_pago: null, p_clave_idempotencia: `pack-${RUN}` })).error);
  assert.ifError((await db.from("purchases").insert({ company_id: C, pack_id: "inicio", modalidad: "unico", importe_centimos: 4900, iva_centimos: 1029, estado: "pagada" })).error);
  assert.ifError((await db.from("servicios_contratados").insert({ company_id: C, servicio: "implantacion", importe_centimos: 90000, periodicidad: "unico" })).error);
  // Storage local puede estar roto (p. ej. «database error, code: 42P10» tras actualizar la CLI): entonces se saltan solo las
  // comprobaciones de archivos, diciéndolo, en vez de dar por buena una exportación que no se pudo subir.
  const subida = await db.storage.from("conocimiento").upload(`${C}/fuente-${RUN}/catalogo.txt`, new TextEncoder().encode("Catálogo"), { contentType: "text/plain" });
  STORAGE = !subida.error;
  if (subida.error) console.warn(`[clientes.test] Storage local no disponible (${subida.error.message}): se saltan las pruebas de archivos.`);
});
let STORAGE = true;

after(async () => {
  for (const id of usuarios) await db.auth.admin.deleteUser(id).catch(() => {});
});

describe("listado y salud", () => {
  it("lista la empresa con propietario, saldo y salud, sin las de examen", async () => {
    const lista = await obtenerClientes(db);
    const c = lista.find((x) => x.id === C);
    assert.ok(c);
    assert.equal(c.propietario?.id, duena.id);
    assert.equal(c.saldo, 5000);
    assert.ok(["verde", "ambar", "rojo"].includes(c.salud.color));
    assert.ok(c.salud.senales.length > 0);
    const { data: examen } = await db.from("companies").select("id").eq("es_examen", true);
    for (const e of examen ?? []) assert.ok(!lista.some((x) => x.id === e.id));
  });
});

describe("créditos", () => {
  it("solo finanzas o admin; el motivo es obligatorio", async () => {
    await assert.rejects(s.ajustarCreditos(comercial, { companyId: C, tipo: "regalo", creditos: 100, motivo, clave: `k-${RUN}-0` }), /rol no permite/);
    await assert.rejects(s.ajustarCreditos(finanzas, { companyId: C, tipo: "regalo", creditos: 100, motivo: "", clave: `k-${RUN}-0` }), /motivo/);
  });
  it("un regalo crea un lote 'regalo', un movimiento 'ajuste', avisa y se anota; repetir la clave no regala dos veces", async () => {
    const r1 = await s.ajustarCreditos(finanzas, { companyId: C, tipo: "regalo", creditos: 300, diasCaducidad: 30, motivo, clave: `k-${RUN}-1` });
    const r2 = await s.ajustarCreditos(finanzas, { companyId: C, tipo: "regalo", creditos: 300, diasCaducidad: 30, motivo, clave: `k-${RUN}-1` });
    assert.equal(r1.saldo, 5300);
    assert.equal(r2.duplicado, true);
    const lotes = (await db.from("credit_lots").select("origen, creditos_iniciales").eq("company_id", C).eq("origen", "regalo")).data!;
    assert.deepEqual(lotes, [{ origen: "regalo", creditos_iniciales: 300 }]);
    const libro = (await db.from("credit_ledger").select("tipo, creditos").eq("company_id", C).eq("concepto", "regalo")).data!;
    assert.deepEqual(libro, [{ tipo: "ajuste", creditos: 300 }]);
    assert.equal((await auditoria(C, "cliente.creditos_regalo")).length, 1);
    assert.equal((await auditoria(C, "cliente.creditos_regalo"))[0].motivo, motivo);
    assert.ok((await db.from("notifications").select("id").eq("company_id", C).eq("tipo", "creditos_regalados")).data!.length >= 1);
  });
  it("un ajuste negativo retira de los lotes que caducan antes y nunca deja el saldo negativo", async () => {
    await assert.rejects(s.ajustarCreditos(admin, { companyId: C, tipo: "ajuste", creditos: -999_999, motivo, clave: `k-${RUN}-2` }), /créditos por operación|saldo suficiente/);
    await assert.rejects(s.ajustarCreditos(admin, { companyId: C, tipo: "ajuste", creditos: -6000, motivo, clave: `k-${RUN}-3` }), /saldo suficiente/);
    const r = await s.ajustarCreditos(admin, { companyId: C, tipo: "ajuste", creditos: -200, motivo, clave: `k-${RUN}-4` });
    assert.equal(r.saldo, 5100);
    // El regalo (30 días) caduca antes que el pack (365): se retira de él.
    const regalo = (await db.from("credit_lots").select("creditos_restantes").eq("company_id", C).eq("origen", "regalo").single()).data!;
    assert.equal(regalo.creditos_restantes, 100);
    const neg = (await db.from("credit_ledger").select("tipo, creditos").eq("company_id", C).eq("concepto", "ajuste_admin")).data!;
    assert.deepEqual(neg, [{ tipo: "ajuste", creditos: -200 }]);
  });
});

describe("pausar, suspender y reactivar", () => {
  it("pausar: el motor no empieza nada, la empresa no puede reanudar y se avisa", async () => {
    await assert.rejects(s.cambiarEstado(comercial, { companyId: C, accion: "pausar", motivoTipo: "impago", motivo }), /rol no permite/);
    await s.cambiarEstado(soporte, { companyId: C, accion: "pausar", motivoTipo: "impago", motivo });
    const a = (await db.from("company_credit_settings").select("agentes_pausados, pausada_por_samgple, pausada_samgple_motivo").eq("company_id", C).single()).data!;
    assert.equal(a.agentes_pausados, true);
    assert.equal(a.pausada_por_samgple, soporte.sesion.userId);
    assert.equal((await new SupabaseAgentStore(db).controlDeEjecucion(C)).oficinaPausada, true);
    assert.equal((await db.from("notifications").select("id").eq("company_id", C).eq("tipo", "oficina_pausada_samgple")).data!.length, 1);
  });
  it("suspender: nadie de la empresa entra (RLS) y los agentes siguen parados; reactivar lo deshace todo", async () => {
    await s.cambiarEstado(finanzas, { companyId: C, accion: "suspender", motivoTipo: "abuso", motivo });
    const cli = createClient(url, anon, { auth: { persistSession: false } });
    assert.ifError((await cli.auth.signInWithPassword({ email: ana.email, password: ana.password })).error);
    assert.equal((await cli.from("contacts").select("id").eq("company_id", C)).data!.length, 0);
    assert.equal((await db.from("companies").select("estado, suspendida_motivo").eq("id", C).single()).data!.suspendida_motivo, "abuso");
    assert.equal((await db.from("notifications").select("id").eq("company_id", C).eq("tipo", "empresa_suspendida")).data!.length, 1);

    await s.cambiarEstado(soporte, { companyId: C, accion: "reactivar", motivo });
    const c = (await db.from("companies").select("estado, suspendida_motivo").eq("id", C).single()).data!;
    assert.deepEqual(c, { estado: "activa", suspendida_motivo: null });
    const a = (await db.from("company_credit_settings").select("agentes_pausados, pausada_por_samgple").eq("company_id", C).single()).data!;
    assert.deepEqual(a, { agentes_pausados: false, pausada_por_samgple: null });
    assert.equal((await new SupabaseAgentStore(db).controlDeEjecucion(C)).oficinaPausada, false);
    assert.equal((await cli.from("contacts").select("id").eq("company_id", C)).data!.length, 1);
    await assert.rejects(s.cambiarEstado(soporte, { companyId: C, accion: "reactivar", motivo }), /ya está activa/);
    for (const accion of ["cliente.pausar", "cliente.suspender", "cliente.reactivar"]) assert.equal((await auditoria(C, accion)).length, 1, accion);
  });
});

describe("ficha, notas y datos fiscales", () => {
  it("guarda responsable y servicios; las notas son de solo inserción", async () => {
    await s.guardarFicha(comercial, { companyId: C, responsable: comercial.sesion.userId, servicios: ["implantacion", "formacion"] });
    await assert.rejects(s.guardarFicha(comercial, { companyId: C, responsable: duena.id, servicios: [] }), /persona activa de SAMGPLE/);
    const lista = await obtenerClientes(db);
    assert.equal(lista.find((x) => x.id === C)?.responsable?.id, comercial.sesion.userId);
    await s.anotar(comercial, { companyId: C, texto: "Llamar al propietario el lunes." });
    const nota = (await db.from("cliente_notas").select("id").eq("company_id", C).single()).data!;
    assert.ok((await db.from("cliente_notas").update({ texto: "editada" }).eq("id", nota.id)).error);
  });
  it("datos fiscales: valida el NIF y el correo; solo comercial, finanzas o admin", async () => {
    const f = { companyId: C, razonSocial: "Empresa de Prueba, S.L.", nif: "b-12345678", direccion: "Calle Mayor 1", codigoPostal: "28001", ciudad: "Madrid", pais: "es", emailFacturacion: "facturas@prueba.example", motivo };
    await assert.rejects(s.guardarFiscales(soporte, f), /rol no permite/);
    await assert.rejects(s.guardarFiscales(finanzas, { ...f, nif: "12" }), /NIF/);
    await s.guardarFiscales(finanzas, f);
    assert.equal((await db.from("empresa_datos_fiscales").select("nif").eq("company_id", C).single()).data!.nif, "B12345678");
  });
});

describe("miembros", () => {
  it("reenviar una invitación anula la anterior y devuelve el enlace si no hay correo", async () => {
    const { data: invId, error } = await db.rpc("invitacion_crear", { p_company_id: C, p_actor: duena.id, p_email: `nuevo-${RUN}@test.example`, p_rol: "miembro", p_token_hash: randomUUID().replaceAll("-", "").repeat(2) });
    assert.ifError(error);
    const r = await s.reenviarInvitacion(comercial, { companyId: C, invitacionId: invId, motivo }, { appUrl: "http://localhost:3000" });
    assert.match(r.enlace ?? "", /^http:\/\/localhost:3000\/invitacion\/[A-Za-z0-9_-]{40,}$/);
    const invs = (await db.from("company_invitations").select("revocada_en").eq("company_id", C)).data!;
    assert.equal(invs.filter((i) => !i.revocada_en).length, 1);
  });
  it("reenviar una invitación de propietario conserva la marca; con propietario ya no se puede", async () => {
    const { data: inv, error } = await db.from("company_invitations").insert({ company_id: C, email: `prop-${RUN}@test.example`, rol: "admin", propietario: true, token_hash: randomUUID().replaceAll("-", "").repeat(2), invitado_por: soporte.sesion.userId }).select("id").single();
    assert.ifError(error);
    // La empresa ya tiene propietaria: el reenvío se rechaza en vez de convertirla en una invitación de admin normal.
    await assert.rejects(s.reenviarInvitacion(soporte, { companyId: C, invitacionId: inv.id, motivo }, { appUrl: null }), /ya tiene propietario/);
    const { data: prop } = await db.from("company_members").select("user_id").eq("company_id", C).eq("rol", "propietario").single();
    assert.ifError((await db.from("company_members").update({ rol: "admin" }).eq("company_id", C).eq("user_id", prop!.user_id)).error);
    await s.reenviarInvitacion(soporte, { companyId: C, invitacionId: inv.id, motivo }, { appUrl: null });
    const nueva = (await db.from("company_invitations").select("rol, propietario").eq("company_id", C).eq("email", `prop-${RUN}@test.example`).is("revocada_en", null).single()).data!;
    assert.deepEqual(nueva, { rol: "admin", propietario: true });
    assert.ifError((await db.from("company_members").update({ rol: "propietario" }).eq("company_id", C).eq("user_id", prop!.user_id)).error);
    assert.ifError((await db.from("company_invitations").update({ revocada_en: new Date().toISOString() }).eq("company_id", C).eq("email", `prop-${RUN}@test.example`)).error);
  });
  it("cambio de propietario: soporte lo pide, la empresa lo confirma; solo el propietario actual puede", async () => {
    await assert.rejects(s.pedirCambioPropietario(comercial, { companyId: C, nuevoUserId: ana.id, motivo, confirmarAhora: false }), /rol no permite/);
    const r = await s.pedirCambioPropietario(soporte, { companyId: C, nuevoUserId: ana.id, motivo, confirmarAhora: true }); // sin ser admin_samgple: queda pendiente
    assert.equal(r.estado, "pendiente");
    await assert.rejects(s.pedirCambioPropietario(soporte, { companyId: C, nuevoUserId: compartida.id, motivo, confirmarAhora: false }), /pendiente/);
    const post = (quien: Sesion) => cambioPropietarioPostHandler(new Request("http://x", { method: "POST", body: JSON.stringify({ decision: "confirmar" }) }), { db, autenticar: async () => quien }, r.cambioId);
    assert.equal((await post({ companyId: C, userId: compartida.id, rol: "admin", puedeAprobar: true })).status, 403);
    const ok = await post({ companyId: C, userId: duena.id, rol: "propietario", puedeAprobar: true });
    assert.equal(ok.status, 200);
    const roles = Object.fromEntries((await db.from("company_members").select("user_id, rol").eq("company_id", C)).data!.map((m) => [m.user_id, m.rol]));
    assert.equal(roles[ana.id], "propietario");
    assert.equal(roles[duena.id], "admin");
  });
  it("admin_samgple puede aplicarlo en el acto (segunda confirmación)", async () => {
    const r = await s.pedirCambioPropietario(admin, { companyId: C, nuevoUserId: duena.id, motivo, confirmarAhora: true });
    assert.equal(r.estado, "confirmado");
    assert.equal((await db.from("company_members").select("rol").eq("company_id", C).eq("user_id", duena.id).single()).data!.rol, "propietario");
    assert.equal((await auditoria(C, "cliente.propietario_confirmar")).length, 1);
  });
});

describe("exportación", () => {
  let expId = "";
  it("se genera en segundo plano y SAMGPLE no recibe el contenido", async (t) => {
    if (!STORAGE) return t.skip("Storage local no disponible");
    await assert.rejects(s.pedirExportacion(comercial, { companyId: C, motivo }), /rol no permite/);
    expId = await s.pedirExportacion(soporte, { companyId: C, motivo });
    await assert.rejects(s.pedirExportacion(soporte, { companyId: C, motivo }), /en marcha/);
    await generarExportacion(db, expId);
    const e = (await db.from("empresa_exportaciones").select("estado, ruta_archivo, tamano_bytes").eq("id", expId).single()).data!;
    assert.equal(e.estado, "lista");
    const { data: archivo } = await db.storage.from(BUCKET_EXPORTACIONES).download(e.ruta_archivo!);
    const doc = JSON.parse(await archivo!.text());
    assert.equal(doc.empresa.id, C);
    assert.equal(doc.datos.contacts[0].name, "Cliente Final");
    assert.ok(!("embedding" in doc.datos.memory_nodes[0]));
    assert.ok(!("instructions" in doc.datos.agents[0]));
    assert.ok(!JSON.stringify(doc).includes("coste_ia_usd_micros"));
  });
  it("solo la descarga un propietario o admin de esa empresa", async (t) => {
    if (!STORAGE) return t.skip("Storage local no disponible");
    const pedir = (quien: Sesion) => exportacionDescargaHandler(new Request("http://x"), { db, autenticar: async () => quien }, expId);
    assert.equal((await pedir({ companyId: C, userId: ana.id, rol: "miembro", puedeAprobar: false })).status, 403);
    assert.equal((await pedir({ companyId: OTRA, userId: compartida.id, rol: "propietario", puedeAprobar: true })).status, 404);
    const ok = await pedir({ companyId: C, userId: duena.id, rol: "propietario", puedeAprobar: true });
    assert.equal(ok.status, 302);
    assert.ok("error" in (await enlaceDeDescarga(db, C, expId, new Date(Date.now() + 8 * 86_400_000))));
    assert.equal((await db.from("empresa_exportaciones").select("estado").eq("id", expId).single()).data!.estado, "caducada");
  });
});

describe("borrar la empresa", () => {
  it("solo admin_samgple y con el nombre exacto; si falla no se borra nada", async () => {
    await assert.rejects(s.borrarEmpresa(soporte, { companyId: C, nombre: NOMBRE, motivo, entiendo: true }), /rol no permite/);
    await assert.rejects(s.borrarEmpresa(admin, { companyId: C, nombre: NOMBRE.toUpperCase(), motivo, entiendo: true }), /no coincide/);
    await assert.rejects(s.borrarEmpresa(admin, { companyId: C, nombre: NOMBRE, motivo, entiendo: false }), /no se puede deshacer/);
    assert.equal((await db.from("contacts").select("id").eq("company_id", C)).data!.length, 1);
  });
  it("borra todos los datos y conserva solo libro, lotes, compras, datos fiscales y auditoría", async () => {
    const libroAntes = (await db.from("credit_ledger").select("id", { count: "exact", head: true }).eq("company_id", C)).count;
    const r = await s.borrarEmpresa(admin, { companyId: C, nombre: NOMBRE, motivo, entiendo: true });
    assert.ok(r.cuentasBorradas >= 2, JSON.stringify(r)); // la dueña y Ana; la persona compartida conserva su cuenta
    assert.equal((await db.from("companies").select("estado").eq("id", C).single()).data!.estado, "borrada");

    const conservadas = new Set(["credit_ledger", "credit_lots", "purchases", "empresa_datos_fiscales", "admin_audit_log"]);
    for (const t of ["company_members", "departments", "agents", "agent_versions", "contacts", "memory_nodes", "notifications", "company_credit_settings", "company_invitations", "cambios_propietario", "cliente_ficha", "cliente_notas", "empresa_exportaciones"]) {
      assert.ok(!conservadas.has(t));
      const { count, error } = await db.from(t).select("*", { count: "exact", head: true }).eq("company_id", C);
      assert.ifError(error);
      assert.equal(count, 0, `${t} debería estar vacía`);
    }
    assert.equal((await db.from("credit_ledger").select("id", { count: "exact", head: true }).eq("company_id", C)).count, libroAntes);
    assert.equal((await db.from("purchases").select("id").eq("company_id", C)).data!.length, 1);
    assert.equal((await db.from("empresa_datos_fiscales").select("nif").eq("company_id", C)).data!.length, 1);
    assert.equal((await db.from("servicios_contratados").select("id").eq("company_id", C)).data!.length, 1);
    if (STORAGE) assert.equal((await db.storage.from("conocimiento").list(C)).data!.length, 0);
    assert.ok((await db.auth.admin.getUserById(compartida.id)).data.user);
    assert.equal((await db.auth.admin.getUserById(ana.id)).data.user, null);
    assert.equal((await auditoria(C, "cliente.borrar")).length, 1);
    // Ya no admite acciones.
    await assert.rejects(s.ajustarCreditos(admin, { companyId: C, tipo: "regalo", creditos: 1, motivo, clave: `k-${RUN}-9` }), /borrada/);
    assert.equal((await new SupabaseAgentStore(db).controlDeEjecucion(C)).oficinaPausada, true);
  });
  it("agent_versions sigue siendo de solo inserción fuera del borrado", async () => {
    const { data } = await db.from("agent_versions").select("id").limit(1).maybeSingle();
    if (data) assert.ok((await db.from("agent_versions").delete().eq("id", data.id)).error);
  });
});
