/**
 * Panel interno de márgenes: solo `admin_idesie` entra, ninguna empresa cliente ve nada y las cuentas salen bien.
 * Contra la base LOCAL. Ejecutar: npm run test:admin
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { sesionAdminIdesie } from "../../src/lib/admin/acceso.ts";
import { obtenerMargenes, primerDiaDelMes } from "../../src/lib/admin/margenes.ts";
import { altaEnEmpresa, rolDePlataforma } from "../ayuda/miembros.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);
const db = createClient(url, key, { auth: { persistSession: false } });
const RUN = Date.now().toString(36);
const ENV = { CAMBIO_USD_POR_EUR: "1.08" };
// Un crédito = 10.800 micros de dólar con ese cambio. El libro es de solo inserción, así que cada ejecución usa un mes propio
// (año lejano y distinto cada vez): no choca ni con la semilla ni con ejecuciones anteriores.
const ANIO = 4000 + (Math.floor(Date.now() / 1000) % 5999);
const MES = `${ANIO}-05`;
const EN_MES = `${ANIO}-05-15T10:00:00Z`;
const SIG_MES = `${ANIO}-06`;

type Usuario = { id: string; token: string; tokenMfa?: string };

/** Código TOTP (RFC 6238, 30 s, 6 cifras) de un secreto base32, como lo calcula una app de autenticación. */
function codigoTotp(secretoBase32: string, ahora = Date.now()): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretoBase32.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(ch).toString(2).padStart(5, "0");
  const clave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(ahora / 30_000)));
  const h = createHmac("sha1", clave).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
const authUsers: string[] = [];
async function usuario(companyId: string, role: "owner" | "admin" | "member" | "admin_idesie", etiqueta: string): Promise<Usuario> {
  const email = `adm-${etiqueta}-${RUN}@test.example`;
  const password = `Pw-${RUN}-${etiqueta}-Aa1!`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  authUsers.push(data.user!.id);
  assert.ifError((role === "admin_idesie" ? await rolDePlataforma(db, { id: data.user!.id, nombre: etiqueta, email, rol: "admin_samgple" }) : await altaEnEmpresa(db, { id: data.user!.id, companyId, nombre: etiqueta, email, rol: role })).error);
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  assert.ifError(s.error);
  const token = s.data.session!.access_token;
  if (role !== "admin_idesie") return { id: data.user!.id, token };
  // El panel exige la verificación en dos pasos (aal2): se da de alta una app TOTP y se verifica un código.
  const alta = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: `prueba-${RUN}` });
  assert.ifError(alta.error);
  const v = await c.auth.mfa.challengeAndVerify({ factorId: alta.data!.id, code: codigoTotp((alta.data as { totp: { secret: string } }).totp.secret) });
  assert.ifError(v.error);
  return { id: data.user!.id, token, tokenMfa: v.data!.access_token };
}
const cab = (token?: string) => ({ get: (n: string) => (n.toLowerCase() === "authorization" && token ? `Bearer ${token}` : null) });

let C = "", INTERNA = "";
let owner: Usuario, idesie: Usuario;
let agBueno = "", agMalo = "";

before(async () => {
  C = randomUUID(); INTERNA = randomUUID();
  assert.ifError((await db.from("companies").insert([{ id: C, name: `test-adm cliente ${RUN}` }, { id: INTERNA, name: `test-adm interna ${RUN}` }])).error);
  owner = await usuario(C, "owner", "owner");
  idesie = await usuario(INTERNA, "admin_idesie", "idesie");

  const dep = (await db.from("departments").insert({ company_id: C, slug: "v", name: "Ventas" }).select("id").single()).data!.id as string;
  const nuevo = async (slug: string, name: string) =>
    (await db.from("agents").insert({ company_id: C, department_id: dep, slug: `${slug}-${RUN}`, name, role: "x", creator_name: "x", model: "claude-haiku-5-5", allowed_tools: [], instructions: "x" }).select("id").single()).data!.id as string;
  agBueno = await nuevo("bueno", "Agente Bueno");
  agMalo = await nuevo("malo", "Agente Malo");

  // Compras: una pagada (cuenta) y una simulada (no cuenta).
  assert.ifError((await db.from("purchases").insert([
    { company_id: C, pack_id: "inicio", modalidad: "unico", importe_centimos: 4900, iva_centimos: 1029, estado: "pagada", creado_en: EN_MES },
    { company_id: C, pack_id: "pro", modalidad: "unico", importe_centimos: 14900, iva_centimos: 3129, estado: "simulada", creado_en: EN_MES },
  ])).error);

  // Costes: bueno = 10 tareas simples a 2 créditos con coste 2.160 µ$ (10 % de lo cobrado); malo = 2 expertas a 50 créditos con 400.000 µ$ (74 %).
  const fila = (agent_id: string, tipo: string, creditos: number, coste: number) =>
    ({ task_id: randomUUID(), company_id: C, agent_id, modelo: "claude-haiku-5-5", coste_ia_usd_micros: coste, creditos_cobrados: creditos, tipo_tarea: tipo, creado_en: EN_MES });
  const costes = [...Array.from({ length: 10 }, () => fila(agBueno, "simple", 2, 2160)), fila(agMalo, "experta", 50, 400_000), fila(agMalo, "experta", 50, 400_000)];
  assert.ifError((await db.from("task_costs").insert(costes)).error);
  const lote = (await db.from("credit_lots").insert({ company_id: C, origen: "pack", pack_id: "inicio", creditos_iniciales: 5000, creditos_restantes: 0, caduca_en: `${ANIO}-12-01T00:00:00Z`, creado_en: EN_MES }).select("id").single()).data!.id as string;
  const consumo = costes.map((c) => ({ company_id: C, tipo: "consumo", creditos: -c.creditos_cobrados, lot_id: lote, task_id: c.task_id, agent_id: c.agent_id, concepto: `tarea_${c.tipo_tarea}`, creado_en: EN_MES }));
  assert.ifError((await db.from("credit_ledger").insert(consumo)).error);
  // Caducidad en el mes (500 créditos) y alertas.
  assert.ifError((await db.from("credit_ledger").insert({ company_id: C, tipo: "caducidad", creditos: -500, concepto: "caducidad", creado_en: EN_MES })).error);
  assert.ifError((await db.from("internal_alerts").insert([
    { tipo: "margen_superado", company_id: C, agent_id: agMalo, detalle: { ratio: 0.74 }, creado_en: EN_MES },
    { tipo: "margen_superado", company_id: C, agent_id: agMalo, detalle: { ratio: 0.74 }, creado_en: EN_MES },
    { tipo: "limite_pasos", company_id: C, agent_id: agMalo, detalle: { pasos: 12 }, creado_en: EN_MES },
    { tipo: "recarga_fallida", company_id: C, detalle: { pack: "inicio" }, creado_en: EN_MES },
    { tipo: "recarga_fallida", company_id: C, detalle: { pack: "inicio" }, creado_en: `${SIG_MES}-02T10:00:00Z` },
  ])).error);
});
after(async () => { for (const id of authUsers) await db.auth.admin.deleteUser(id); });

describe("acceso: solo admin_idesie", () => {
  it("administración entra solo con el segundo paso verificado; propietario, token falso y sin sesión no", async () => {
    assert.deepEqual(await sesionAdminIdesie(cab(idesie.tokenMfa), db, {}), { userId: idesie.id });
    assert.equal(await sesionAdminIdesie(cab(idesie.token), db, {}), null, "con contraseña pero sin el segundo paso (aal1) no entra");
    assert.equal(await sesionAdminIdesie(cab(owner.token), db, {}), null, "un propietario de empresa cliente no entra");
    assert.equal(await sesionAdminIdesie(cab("no-es-un-jwt"), db, {}), null);
    assert.equal(await sesionAdminIdesie(cab(), db, {}), null, "sin sesión ni persona de desarrollo");
    assert.equal(await sesionAdminIdesie({ get: () => "Basic abc" }, db, {}), null);
  });

  it("las variables DEV no sustituyen una sesión de plataforma", async () => {
    assert.equal(await sesionAdminIdesie(cab(), db, { DEV_ADMIN_USER_ID: idesie.id }), null);
    assert.equal(await sesionAdminIdesie(cab(), db, { DEV_ADMIN_USER_ID: owner.id }), null);
    assert.equal(await sesionAdminIdesie(cab("no-es-un-jwt"), db, { DEV_ADMIN_USER_ID: idesie.id }), null);
  });

  it("el navegador (rol authenticated) no puede leer márgenes, costes ni alertas, ni siquiera con su sesión", async () => {
    for (const u of [owner, idesie]) {
      const c = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${u.token}` } } });
      assert.ok((await c.rpc("admin_margenes", { p_mes: `${MES}-01` })).error, "admin_margenes solo para el servicio");
      assert.ok((await c.from("internal_alerts").select("id")).error, "internal_alerts sin permiso");
      assert.ok((await c.from("task_costs").select("task_id")).error, "task_costs sin permiso");
    }
  });
});

describe("cuentas del panel", () => {
  it("valida el mes", () => {
    assert.equal(primerDiaDelMes("2026-11"), "2026-11-01");
    for (const m of ["2026-13", "2026-1", "hoy", "", "2026-11-01"]) assert.equal(primerDiaDelMes(m), null);
  });

  it("por empresa y mes: cobrado (solo compras pagadas), créditos, coste en euros y margen", async () => {
    const d = await obtenerMargenes(db, MES, ENV);
    const f = d.porEmpresaMes.find((x) => x.empresaId === C && x.mes === MES)!;
    assert.equal(f.cobradoCentimos, 4900, "la compra simulada no cuenta y el IVA tampoco");
    assert.equal(f.creditosConsumidos, 10 * 2 + 2 * 50);
    // Coste: 10×2.160 + 2×400.000 = 821.600 µ$ ÷ 10.800 = 76,07 céntimos → 76.
    assert.equal(f.costeIaCentimos, 76);
    assert.equal(f.margenCentimos, 4900 - 76);
    assert.ok(Math.abs(f.margenPct! - ((4900 - 76) / 4900) * 100) < 1e-9);
    assert.equal(d.cambioUsdPorEur, 1.08);
  });

  it("por agente: de peor a mejor margen, con sus alertas", async () => {
    const d = (await obtenerMargenes(db, MES, ENV)).porAgente.filter((x) => x.empresa.startsWith("test-adm cliente"));
    assert.deepEqual(d.map((x) => x.agente), ["Agente Malo", "Agente Bueno"]);
    const [malo, bueno] = d;
    assert.equal(malo.creditosCobrados, 100);
    assert.equal(malo.costeIaCentimos, Math.round(800_000 / 10_800));
    assert.ok(malo.margenPct! < 30 && bueno.margenPct! > 85);
    assert.equal(malo.alertasMargen, 2);
    assert.equal(bueno.alertasMargen, 0);
  });

  it("por tipo de tarea: coste medio real frente a lo cobrado", async () => {
    const d = await obtenerMargenes(db, MES, ENV);
    const exp = d.porTipo.find((t) => t.tipo === "experta")!;
    assert.equal(exp.tareas, 2);
    assert.equal(exp.cobradoMedioCentimos, 50);
    assert.ok(Math.abs(exp.costeMedioCentimos - 400_000 / 10_800) < 1e-9);
    const sim = d.porTipo.find((t) => t.tipo === "simple")!;
    assert.equal(sim.cobradoMedioCentimos, 2);
    assert.ok(Math.abs(sim.costeMedioCentimos - 2160 / 10_800) < 1e-9);
  });

  it("créditos caducados del mes, saldo vivo y alertas solo del mes consultado", async () => {
    const d = await obtenerMargenes(db, MES, ENV);
    assert.equal(d.caducadosMes, 500);
    const { data: vivos } = await db.from("credit_lots").select("creditos_restantes").gt("caduca_en", new Date().toISOString()).gt("creditos_restantes", 0);
    const esperado = (vivos ?? []).reduce((n, l) => n + (l.creditos_restantes as number), 0);
    assert.equal(d.saldoVivo.creditos, esperado, "saldo vivo = créditos de lotes no caducados de todas las empresas");
    assert.ok(d.saldoVivo.creditos > 0);
    const nuestras = d.alertas.filter((a) => a.empresa.startsWith("test-adm cliente"));
    assert.deepEqual(nuestras.map((a) => a.tipo).sort(), ["limite_pasos", "margen_superado", "margen_superado", "recarga_fallida"]);
    assert.equal((await obtenerMargenes(db, SIG_MES, ENV)).alertas.filter((a) => a.empresa.startsWith("test-adm cliente")).length, 1, "la de junio solo sale en junio");
  });

  it("el cambio de moneda sale del entorno: con otro tipo cambia el coste en euros", async () => {
    const a = (await obtenerMargenes(db, MES, { CAMBIO_USD_POR_EUR: "1.08" })).porEmpresaMes.find((x) => x.empresaId === C)!;
    const b = (await obtenerMargenes(db, MES, { CAMBIO_USD_POR_EUR: "2" })).porEmpresaMes.find((x) => x.empresaId === C)!;
    assert.ok(b.costeIaCentimos < a.costeIaCentimos);
    await assert.rejects(obtenerMargenes(db, MES, { CAMBIO_USD_POR_EUR: "pepe" }));
  });
});
