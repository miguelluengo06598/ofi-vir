/* eslint-disable @typescript-eslint/no-explicit-any -- prueba de integración: lee respuestas JSON sin tipar de la API */
/**
 * Pruebas de las rutas /api/creditos/* contra la base LOCAL real, con usuarios reales (JWT de Supabase Auth) de dos
 * empresas. Se llama a los manejadores con `Request` reales (sin servidor web). Las empresas de prueba no se borran
 * (compras y libro son contables): `supabase db reset` las limpia. Ejecutar: npm run test:creditos
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  ajustesHandler, autenticadorSupabase, cancelarBonoHandler, comprarHandler, movimientosHandler, pagosSimuladosActivos, resumenHandler, type DepsApi,
} from "../../src/lib/creditos/api.ts";
import { crearServicioCreditos, CreditosError, type ServicioCreditos } from "../../src/lib/creditos/servicio.ts";
import { rutinaDePrueba } from "../ayuda/persona.ts";
import { altaEnEmpresa } from "../ayuda/miembros.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
if (!url || !key || !anon) throw new Error("Faltan variables de Supabase: ejecuta con `npm run test:creditos` (usa .env.local).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);

const admin = createClient(url, key, { auth: { persistSession: false } });
const silencio = { info() {}, warn() {}, error() {} };
const servicio = crearServicioCreditos({ db: admin, log: silencio, esLocal: true });
const RUN = Date.now().toString(36);

type Usuario = { id: string; token: string };
async function usuario(companyId: string, role: "owner" | "admin" | "member", etiqueta: string): Promise<Usuario> {
  const email = `api-${etiqueta}-${RUN}@test.example`;
  const password = `Pw-${RUN}-${etiqueta}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  assert.ifError((await altaEnEmpresa(admin, { id: data.user!.id, companyId, nombre: `Prueba ${etiqueta}`, email, rol: role })).error);
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  assert.ifError(s.error);
  return { id: data.user!.id, token: s.data.session!.access_token };
}
async function empresa(nombre: string) {
  const id = randomUUID();
  assert.ifError((await admin.from("companies").insert({ id, name: `test-api ${nombre} ${RUN}` })).error);
  return id;
}

const deps = (o: Partial<DepsApi> = {}): DepsApi => ({
  db: admin, servicio, autenticar: autenticadorSupabase(admin, {}), pagosSimulados: true, log: silencio, ...o,
});
const peticion = (metodo: string, ruta: string, token: string | null, cuerpo?: unknown) =>
  new Request(`http://localhost/api/creditos/${ruta}`, {
    method: metodo,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
const leer = async (r: Response) => ({ status: r.status, cuerpo: (await r.json()) as Record<string, any> });
const comprar = (u: Usuario | null, cuerpo: unknown, d = deps()) => comprarHandler(peticion("POST", "comprar", u?.token ?? null, cuerpo), d).then(leer);
const resumen = (u: Usuario | null, d = deps()) => resumenHandler(peticion("GET", "resumen", u?.token ?? null), d).then(leer);
const ajustar = (u: Usuario | null, cuerpo: unknown, d = deps()) => ajustesHandler(peticion("PATCH", "ajustes", u?.token ?? null, cuerpo), d).then(leer);
const cancelarBono = (u: Usuario | null, d = deps(), cuerpo?: unknown) => cancelarBonoHandler(peticion("POST", "cancelar-bono", u?.token ?? null, cuerpo), d).then(leer);
const ajustesDe = async (c: string) => (await admin.from("company_credit_settings").select("*").eq("company_id", c).single()).data as Record<string, any>;
const compras = async (c: string) => ((await admin.from("purchases").select("*").eq("company_id", c).order("creado_en")).data ?? []) as Record<string, any>[];
const lotes = async (c: string) => ((await admin.from("credit_lots").select("*").eq("company_id", c).order("creado_en")).data ?? []) as Record<string, any>[];

let A = "", B = "";
let ownerA: Usuario, memberA: Usuario, ownerB: Usuario;
const authUsers: string[] = [];

before(async () => {
  A = await empresa("A");
  B = await empresa("B");
  ownerA = await usuario(A, "owner", "owner-a");
  memberA = await usuario(A, "member", "member-a");
  ownerB = await usuario(B, "owner", "owner-b");
  authUsers.push(ownerA.id, memberA.id, ownerB.id);
});
after(async () => { for (const id of authUsers) await admin.auth.admin.deleteUser(id); });

describe("autenticación y pagos simulados", () => {
  it("sin sesión o con token falso: 401 en todas las rutas (y un token falso no cae al modo desarrollo)", async () => {
    for (const r of [await comprar(null, { packId: "inicio", modalidad: "unico" }), await resumen(null), await ajustar(null, { topeMensualCreditos: 1 }), await cancelarBono(null)]) {
      assert.equal(r.status, 401);
    }
    const falso = { id: "x", token: "no-es-un-jwt" };
    assert.equal((await resumen(falso)).status, 401);
    const conVariablesDev = deps({ autenticar: autenticadorSupabase(admin, { DEV_COMPANY_ID: A, DEV_USER_ID: ownerA.id }) });
    assert.equal((await resumen(falso, conVariablesDev)).status, 401, "un token inválido no abre una ruta privada");
    assert.equal((await resumen(null, conVariablesDev)).status, 401, "DEV_* no suplanta una sesión en rutas privadas");
  });

  it("PAGOS_SIMULADOS: solo con «true» y nunca en producción", () => {
    assert.equal(pagosSimuladosActivos({ PAGOS_SIMULADOS: "true" }), true);
    assert.equal(pagosSimuladosActivos({ PAGOS_SIMULADOS: "TRUE", NODE_ENV: "development" }), true);
    assert.equal(pagosSimuladosActivos({}), false);
    assert.equal(pagosSimuladosActivos({ PAGOS_SIMULADOS: "false" }), false);
    assert.equal(pagosSimuladosActivos({ PAGOS_SIMULADOS: "1" }), false);
    assert.equal(pagosSimuladosActivos({ PAGOS_SIMULADOS: "true", NODE_ENV: "production" }), false, "ni activándola a mano");
  });

  it("con los pagos simulados desactivados la compra se niega y no añade nada", async () => {
    const c = await empresa("sin-pagos");
    const u = await usuario(c, "owner", "sinpagos");
    authUsers.push(u.id);
    const r = await comprar(u, { packId: "inicio", modalidad: "unico" }, deps({ pagosSimulados: false }));
    assert.equal(r.status, 403);
    assert.equal(r.cuerpo.error, "pagos_no_disponibles");
    assert.equal((await lotes(c)).length, 0);
    assert.equal((await compras(c)).length, 0);
  });
});

describe("POST /api/creditos/comprar", () => {
  it("solo propietarios y administradores", async () => {
    const r = await comprar(memberA, { packId: "inicio", modalidad: "unico" });
    assert.equal(r.status, 403);
    assert.equal((await lotes(A)).length, 0);
  });

  it("valida con zod: pack, modalidad, campos desconocidos (incluido companyId) y JSON roto", async () => {
    for (const cuerpo of [
      { packId: "gigante", modalidad: "unico" }, { packId: "inicio", modalidad: "trimestral" }, { packId: "inicio" }, {},
      { packId: "inicio", modalidad: "unico", companyId: B }, { packId: "inicio", modalidad: "unico", creditos: 999999 },
      { packId: 5, modalidad: "unico" },
    ]) {
      const r = await comprar(ownerA, cuerpo);
      assert.equal(r.status, 400, JSON.stringify(cuerpo));
      assert.equal(r.cuerpo.error, "datos_invalidos");
    }
    const roto = await comprarHandler(peticion("POST", "comprar", ownerA.token, "{no es json"), deps()).then(leer);
    assert.equal(roto.status, 400);
    assert.equal(roto.cuerpo.error, "json_invalido");
    assert.equal((await lotes(A)).length, 0, "ninguna compra inválida añadió créditos");
    assert.equal((await compras(A)).length, 0);
  });

  it("pago único: crea la compra (importe, IVA 21 %) y añade el lote del pack", async () => {
    const r = await comprar(ownerA, { packId: "inicio", modalidad: "unico" });
    assert.equal(r.status, 201);
    assert.deepEqual(r.cuerpo.compra, { id: r.cuerpo.compra.id, packId: "inicio", modalidad: "unico", importeCentimos: 4900, ivaCentimos: 1029, totalCentimos: 5929, estado: "simulada" });
    assert.equal(r.cuerpo.lote.creditos, 5000);
    assert.equal(r.cuerpo.saldoDisponible, 5000);
    assert.equal(r.cuerpo.bonoMensualPackId, null);
    const [compra] = await compras(A);
    assert.equal(compra.estado, "simulada");
    assert.equal(compra.importe_centimos, 4900);
    assert.equal(compra.iva_centimos, 1029);
    assert.equal(compra.total_centimos, 5929);
    assert.equal(compra.referencia_externa, `simulada:${compra.id}`);
    const lote = (await lotes(A))[0];
    assert.equal(lote.origen, "pack");
    assert.equal(lote.creditos_iniciales, 5000);
    // La clave de idempotencia es el id de la compra: repetir la operación no añade otro lote.
    const otra = await servicio.anadirCreditos(A, "inicio", "pack", `simulada:${compra.id}`, `compra:${compra.id}`);
    assert.equal(otra.duplicado, true);
    assert.equal((await lotes(A)).length, 1);
    const { data: libro } = await admin.from("credit_ledger").select("clave_idempotencia").eq("company_id", A).eq("tipo", "compra");
    assert.deepEqual(libro, [{ clave_idempotencia: `compra:${compra.id}` }]);
  });

  it("bono mensual: añade creditos_bono_mensual, guarda bono_mensual_pack_id y no se puede contratar dos veces", async () => {
    const c = await empresa("bono");
    const u = await usuario(c, "admin", "bono");
    authUsers.push(u.id);
    const r = await comprar(u, { packId: "pro", modalidad: "bono_mensual" });
    assert.equal(r.status, 201);
    assert.equal(r.cuerpo.lote.creditos, 17600, "+10 %: 17.600 en vez de 16.000");
    assert.equal(r.cuerpo.bonoMensualPackId, "pro");
    assert.equal(r.cuerpo.compra.importeCentimos, 14900);
    assert.equal(r.cuerpo.compra.ivaCentimos, 3129);
    const a = await ajustesDe(c);
    assert.equal(a.bono_mensual_pack_id, "pro");
    assert.ok(a.bono_proxima_renovacion_en, "queda programada la primera renovación");
    assert.equal((await lotes(c))[0].origen, "bono_mensual");
    const otra = await comprar(u, { packId: "business", modalidad: "bono_mensual" });
    assert.equal(otra.status, 409);
    assert.equal(otra.cuerpo.error, "bono_ya_activo");
    assert.equal((await lotes(c)).length, 1);
    assert.equal((await compras(c)).length, 1, "la compra rechazada no deja rastro");
    assert.equal((await ajustesDe(c)).bono_mensual_pack_id, "pro");
  });

  it("dos bonos a la vez: solo uno se activa", async () => {
    const c = await empresa("bono-paralelo");
    const u = await usuario(c, "owner", "bonopar");
    authUsers.push(u.id);
    const rs = await Promise.all([1, 2, 3].map(() => comprar(u, { packId: "inicio", modalidad: "bono_mensual" })));
    assert.equal(rs.filter((r) => r.status === 201).length, 1);
    assert.equal(rs.filter((r) => r.status === 409).length, 2);
    assert.equal((await lotes(c)).length, 1);
  });

  it("pack Prueba: una sola vez por empresa y sin bono mensual", async () => {
    const c = await empresa("prueba");
    const u = await usuario(c, "owner", "prueba");
    authUsers.push(u.id);
    const bono = await comprar(u, { packId: "prueba", modalidad: "bono_mensual" });
    assert.equal(bono.status, 400);
    assert.equal(bono.cuerpo.error, "pack_sin_bono");
    assert.equal((await ajustesDe(c)).prueba_usada, false, "el intento rechazado no gasta la prueba");

    const r = await comprar(u, { packId: "prueba", modalidad: "unico" });
    assert.equal(r.status, 201);
    assert.equal(r.cuerpo.lote.creditos, 2000);
    assert.equal(r.cuerpo.compra.importeCentimos, 1900);
    assert.equal(r.cuerpo.compra.ivaCentimos, 399);
    const lote = (await lotes(c))[0];
    assert.equal(lote.origen, "prueba");
    assert.ok(Math.abs(Date.parse(lote.caduca_en) - Date.parse(lote.creado_en) - 30 * 86_400_000) < 60_000, "caduca a los 30 días");
    assert.equal((await ajustesDe(c)).prueba_usada, true);

    const otra = await comprar(u, { packId: "prueba", modalidad: "unico" });
    assert.equal(otra.status, 409);
    assert.equal(otra.cuerpo.error, "pack_ya_usado");
    assert.equal((await lotes(c)).length, 1);
    assert.equal((await compras(c)).length, 1);
  });

  it("dos compras de la prueba a la vez: solo una pasa y la otra queda registrada como fallida", async () => {
    const c = await empresa("prueba-paralela");
    const u = await usuario(c, "owner", "pruebapar");
    authUsers.push(u.id);
    const rs = await Promise.all([1, 2, 3].map(() => comprar(u, { packId: "prueba", modalidad: "unico" })));
    assert.equal(rs.filter((r) => r.status === 201).length, 1);
    assert.ok(rs.filter((r) => r.status === 409).length >= 1 || rs.length === 1);
    assert.equal((await lotes(c)).length, 1, "un solo lote de prueba");
    const estados = (await compras(c)).map((x) => x.estado);
    assert.equal(estados.filter((e) => e === "simulada").length, 1);
    assert.ok(estados.every((e) => e === "simulada" || e === "fallida"));
  });

  it("si añadir los créditos falla, la compra queda «fallida» y el bono no se queda activado", async () => {
    const c = await empresa("fallo");
    const u = await usuario(c, "owner", "fallo");
    authUsers.push(u.id);
    const roto = { ...servicio, anadirCreditos: async () => { throw new CreditosError("error_interno", "boom"); } } as ServicioCreditos;
    const r = await comprar(u, { packId: "pro", modalidad: "bono_mensual" }, deps({ servicio: roto }));
    assert.equal(r.status, 500);
    assert.doesNotMatch(JSON.stringify(r.cuerpo), /boom/, "no se filtran detalles internos");
    assert.deepEqual((await compras(c)).map((x) => x.estado), ["fallida"]);
    assert.equal((await ajustesDe(c)).bono_mensual_pack_id, null);
    assert.equal((await lotes(c)).length, 0);
  });
});

describe("POST /api/creditos/cancelar-bono", () => {
  it("solo propietarios/administradores; conserva los créditos y es repetible", async () => {
    const c = await empresa("cancelar");
    const owner = await usuario(c, "owner", "cancelar-o");
    const member = await usuario(c, "member", "cancelar-m");
    authUsers.push(owner.id, member.id);
    await comprar(owner, { packId: "inicio", modalidad: "bono_mensual" });
    assert.equal((await cancelarBono(member)).status, 403);
    assert.equal((await ajustesDe(c)).bono_mensual_pack_id, "inicio", "un miembro no puede cancelar");
    assert.equal((await cancelarBono(owner, deps(), { companyId: B })).status, 400, "no admite datos");

    const r = await cancelarBono(owner);
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo, { cancelado: true, bonoAnteriorPackId: "inicio" });
    const a = await ajustesDe(c);
    assert.equal(a.bono_mensual_pack_id, null);
    assert.equal(a.bono_proxima_renovacion_en, null, "ya no hay renovación pendiente");
    assert.equal((await servicio.obtenerSaldo(c)).disponible, 5500, "los créditos ya recibidos se conservan");
    const otra = await cancelarBono(owner);
    assert.deepEqual(otra.cuerpo, { cancelado: false, bonoAnteriorPackId: null });
    // Tras cancelar se puede volver a contratar.
    assert.equal((await comprar(owner, { packId: "pro", modalidad: "bono_mensual" })).status, 201);
  });
});

describe("PATCH /api/creditos/ajustes", () => {
  it("solo propietarios/administradores", async () => {
    assert.equal((await ajustar(memberA, { topeMensualCreditos: 100 })).status, 403);
    assert.equal((await ajustesDe(A)).tope_mensual_creditos, null);
  });

  it("valida: negativos, decimales, packs que no valen, campos ajenos (estado de la oficina, otra empresa) y cuerpo vacío", async () => {
    const malos: unknown[] = [
      { topeMensualCreditos: -1 }, { topeMensualCreditos: 1.5 }, { topeMensualCreditos: "mucho" },
      { recargaAuto: { activa: true, umbral: 0, packId: "inicio" } }, { recargaAuto: { umbral: 100, packId: "prueba" } },
      { recargaAuto: { umbral: 100, packId: "gigante" } }, { recargaAuto: { activa: "si" } },
      { estado_oficina: "activa" }, { estadoOficina: "activa" }, { companyId: B, topeMensualCreditos: 5 },
      { recargaAuto: { activa: true, umbral: 100, packId: "inicio", extra: 1 } }, {}, { recargaAuto: {} },
    ];
    for (const cuerpo of malos) {
      const r = await ajustar(ownerA, cuerpo);
      assert.equal(r.status, 400, JSON.stringify(cuerpo));
    }
    const a = await ajustesDe(A);
    assert.equal(a.tope_mensual_creditos, null);
    assert.equal(a.recarga_auto_activa, false);
  });

  it("activar la recarga automática exige umbral y pack", async () => {
    const c = await empresa("recarga");
    const u = await usuario(c, "owner", "recarga");
    authUsers.push(u.id);
    const sin = await ajustar(u, { recargaAuto: { activa: true } });
    assert.equal(sin.status, 400);
    assert.equal(sin.cuerpo.error, "recarga_incompleta");
    assert.equal((await ajustar(u, { recargaAuto: { activa: true, umbral: 500 } })).status, 400);
    assert.equal((await ajustesDe(c)).recarga_auto_activa, false);
  });

  it("guarda tope y recarga; cada cambio respeta lo anterior; null quita el tope", async () => {
    const c = await empresa("ajustes-ok");
    const u = await usuario(c, "admin", "ajustesok");
    authUsers.push(u.id);
    let r = await ajustar(u, { topeMensualCreditos: 2000 });
    assert.equal(r.status, 200);
    assert.equal(r.cuerpo.ajustes.topeMensualCreditos, 2000);
    r = await ajustar(u, { recargaAuto: { activa: true, umbral: 800, packId: "pro" } });
    assert.deepEqual(r.cuerpo.ajustes.recargaAuto, { activa: true, umbral: 800, packId: "pro" });
    assert.equal(r.cuerpo.ajustes.topeMensualCreditos, 2000, "el tope sigue");
    r = await ajustar(u, { recargaAuto: { umbral: 1000 } });
    assert.deepEqual(r.cuerpo.ajustes.recargaAuto, { activa: true, umbral: 1000, packId: "pro" }, "solo cambia el umbral");
    r = await ajustar(u, { recargaAuto: { activa: false } });
    assert.equal(r.cuerpo.ajustes.recargaAuto.activa, false);
    r = await ajustar(u, { topeMensualCreditos: null });
    assert.equal(r.cuerpo.ajustes.topeMensualCreditos, null);
    const a = await ajustesDe(c);
    assert.equal(a.tope_mensual_creditos, null);
    assert.equal(a.recarga_auto_pack_id, "pro");
    assert.equal(a.estado_oficina, "activa", "estos ajustes no tocan el estado");
  });
});

describe("GET /api/creditos/resumen", () => {
  it("devuelve saldo, lotes, consumo por agente/departamento/tipo, rutinas, estado, ajustes y packs", async () => {
    const c = await empresa("resumen");
    const owner = await usuario(c, "owner", "resumen-o");
    const member = await usuario(c, "member", "resumen-m");
    authUsers.push(owner.id, member.id);
    const dep = (await admin.from("departments").insert({ company_id: c, slug: "ventas", name: "Ventas" }).select("id").single()).data!.id as string;
    const mkAgente = async (slug: string, name: string) =>
      (await admin.from("agents").insert({ company_id: c, department_id: dep, slug: `${slug}-${RUN}`, name, role: "Pruebas", creator_name: "x", model: "claude-haiku-5-5", allowed_tools: [], instructions: "x" }).select("id").single()).data!.id as string;
    const lucia = await mkAgente("lucia", "Lucía de prueba");
    const hugo = await mkAgente("hugo", "Hugo de prueba");

    await comprar(owner, { packId: "inicio", modalidad: "unico" });
    const consumir = async (agentId: string, n: number, concepto: string) => {
      const res = await servicio.reservar(c, randomUUID(), n, { agentId, departmentId: dep });
      await servicio.confirmar(res.reservaId, n, { concepto, agentId, departmentId: dep });
    };
    await consumir(lucia, 10, "tarea_estandar");
    await consumir(lucia, 2, "tarea_simple");
    await consumir(hugo, 50, "tarea_experta");
    await servicio.cobrarConsumoFijo(c, "correo", { agentId: hugo, departmentId: dep }, `correo:${randomUUID()}`);

    const rutina = (nombre: string, tipo: string, frecuencia: string, activa: boolean) =>
      rutinaDePrueba(admin, { company_id: c, agent_id: lucia, nombre, instruccion: "x", tipo_tarea: tipo, frecuencia, proxima_ejecucion_en: new Date(Date.now() + 86_400_000).toISOString() }, activa);
    assert.ifError((await rutina("Diaria simple", "simple", "diaria", true)).error);
    assert.ifError((await rutina("Laborables estándar", "estandar", "laborables", true)).error);
    assert.ifError((await rutina("Pausada", "experta", "cada_hora", false)).error);

    const r = await resumen(member); // cualquier miembro puede leer el resumen
    assert.equal(r.status, 200);
    const x = r.cuerpo;
    assert.deepEqual(x.estadoOficina, { estado: "activa", puedeEjecutarAgentes: true });
    assert.deepEqual(x.saldo, { disponible: 5000 - 63, reservado: 0, enLotes: 5000 - 63, consumidosEsteMes: 63 });
    assert.equal(x.lotes.length, 1);
    assert.equal(x.lotes[0].creditosRestantes, 4937);
    assert.ok(x.lotes[0].caducaEn);
    assert.equal(x.consumoMes.total, 63);
    assert.deepEqual(x.consumoMes.porAgente.map((a: any) => [a.nombre, a.creditos]), [["Hugo de prueba", 51], ["Lucía de prueba", 12]]);
    assert.deepEqual(x.consumoMes.porDepartamento.map((d: any) => [d.nombre, d.creditos]), [["Ventas", 63]]);
    assert.deepEqual(x.consumoMes.porTipoDeTarea.map((t: any) => [t.concepto, t.tipo, t.creditos]), [
      ["tarea_experta", "experta", 50], ["tarea_estandar", "estandar", 10], ["tarea_simple", "simple", 2], ["correo", null, 1],
    ]);
    assert.equal(x.rutinas.activas, 2);
    assert.equal(x.rutinas.costeMensualEstimado, 60 + 220, "solo las activas: diaria simple 60 + laborables estándar 220");
    assert.deepEqual(x.ajustes, { topeMensualCreditos: null, recargaAuto: { activa: false, umbral: null, packId: null }, bonoMensualPackId: null, bonoProximaRenovacionEn: null, pruebaUsada: false });
    assert.deepEqual(x.packs.map((p: any) => p.id), ["prueba", "inicio", "pro", "business", "empresa"]);
    const inicio = x.packs.find((p: any) => p.id === "inicio");
    assert.deepEqual([inicio.creditos, inicio.creditosBonoMensual, inicio.importeCentimos, inicio.ivaCentimos, inicio.totalCentimos], [5000, 5500, 4900, 1029, 5929]);
    assert.equal(x.packs.find((p: any) => p.id === "prueba").disponible, true);
  });

  it("refleja el estado de la oficina y que la prueba ya no está disponible", async () => {
    const c = await empresa("resumen-estado");
    const u = await usuario(c, "owner", "resumen-estado");
    authUsers.push(u.id);
    await comprar(u, { packId: "prueba", modalidad: "unico" });
    await admin.from("company_credit_settings").update({ estado_oficina: "pausada" }).eq("company_id", c);
    const x = (await resumen(u)).cuerpo;
    assert.deepEqual(x.estadoOficina, { estado: "pausada", puedeEjecutarAgentes: false });
    assert.equal(x.packs.find((p: any) => p.id === "prueba").disponible, false);
    assert.equal(x.ajustes.pruebaUsada, true);
  });
});

describe("la empresa A no puede leer ni modificar nada de la empresa B", () => {
  it("el resumen de cada una solo contiene lo suyo, aunque A pida los datos de B", async () => {
    // B tiene datos reconocibles: un lote de 777 créditos, un agente, una rutina, tope y bono propios.
    const lB = await servicio.anadirCreditos(B, "business", "pack", null, `pago:${randomUUID()}`);
    assert.equal(lB.creditos, 45000);
    const depB = (await admin.from("departments").insert({ company_id: B, slug: "secreto", name: "Departamento secreto de B" }).select("id").single()).data!.id as string;
    const agB = (await admin.from("agents").insert({ company_id: B, department_id: depB, slug: `secreto-${RUN}`, name: "Agente secreto de B", role: "x", creator_name: "x", model: "claude-haiku-5-5", allowed_tools: [], instructions: "x" }).select("id").single()).data!.id as string;
    await servicio.cobrarConsumoFijo(B, "traspaso", { agentId: agB, departmentId: depB }, `t:${randomUUID()}`);
    await rutinaDePrueba(admin, { company_id: B, agent_id: agB, nombre: "Rutina secreta de B", instruccion: "x", tipo_tarea: "experta", frecuencia: "diaria", proxima_ejecucion_en: new Date(Date.now() + 86_400_000).toISOString() });
    await admin.from("company_credit_settings").update({ tope_mensual_creditos: 123456, bono_mensual_pack_id: "empresa" }).eq("company_id", B);

    const deA = await resumen(ownerA);
    const textoA = JSON.stringify(deA.cuerpo);
    for (const secreto of ["secreto de B", "Rutina secreta", "123456", String(B), String(agB), String(depB), lB.loteId]) {
      assert.ok(!textoA.includes(secreto), `el resumen de A contiene «${secreto}»`);
    }
    assert.equal(deA.cuerpo.ajustes.bonoMensualPackId, null);

    // Ni cambiando la URL ni con cabeceras: la empresa sale de la sesión.
    const rQuery = await resumenHandler(new Request(`http://localhost/api/creditos/resumen?companyId=${B}&company_id=${B}`, { headers: { authorization: `Bearer ${ownerA.token}`, "x-company-id": B } }), deps()).then(leer);
    assert.equal(JSON.stringify(rQuery.cuerpo), textoA, "los parámetros de la URL no cambian de empresa");

    const deB = (await resumen(ownerB)).cuerpo;
    assert.equal(deB.saldo.enLotes, 45000 - 1);
    assert.equal(deB.ajustes.topeMensualCreditos, 123456);
    assert.equal(deB.ajustes.bonoMensualPackId, "empresa");
    assert.deepEqual(deB.consumoMes.porAgente.map((a: any) => a.nombre), ["Agente secreto de B"]);
    assert.equal(deB.rutinas.costeMensualEstimado, 1500);
    assert.ok(!JSON.stringify(deB).includes(String(A)));
  });

  it("A no puede modificar los ajustes, el bono ni el saldo de B", async () => {
    const antes = await ajustesDe(B);
    const lotesAntes = (await lotes(B)).length;
    const comprasAntes = (await compras(B)).length;

    for (const cuerpo of [{ companyId: B, topeMensualCreditos: 1 }, { company_id: B, recargaAuto: { activa: false } }]) {
      assert.equal((await ajustar(ownerA, cuerpo)).status, 400);
    }
    assert.equal((await comprar(ownerA, { packId: "pro", modalidad: "unico", companyId: B })).status, 400);
    assert.equal((await cancelarBono(ownerA, deps(), { companyId: B })).status, 400);

    // Operaciones válidas de A: afectan a A y solo a A.
    const ok = await ajustar(ownerA, { topeMensualCreditos: 777 });
    assert.equal(ok.status, 200);
    const compra = await comprar(ownerA, { packId: "pro", modalidad: "unico" });
    assert.equal(compra.status, 201);
    await cancelarBono(ownerA);

    const despues = await ajustesDe(B);
    assert.deepEqual(despues, antes, "los ajustes de B no cambiaron");
    assert.equal(despues.tope_mensual_creditos, 123456);
    assert.equal(despues.bono_mensual_pack_id, "empresa", "el bono de B sigue activo");
    assert.equal((await lotes(B)).length, lotesAntes, "B no recibió créditos");
    assert.equal((await compras(B)).length, comprasAntes, "B no tiene compras nuevas");
    assert.equal((await ajustesDe(A)).tope_mensual_creditos, 777);
    assert.ok((await compras(A)).every((x) => x.company_id === A));
  });

  it("un miembro de B no puede cambiar nada de A, y B solo ve sus compras", async () => {
    const memberB = await usuario(B, "member", "member-b");
    authUsers.push(memberB.id);
    const topeA = (await ajustesDe(A)).tope_mensual_creditos;
    assert.equal((await ajustar(memberB, { topeMensualCreditos: 1 })).status, 403);
    assert.equal((await ajustesDe(A)).tope_mensual_creditos, topeA);
    // Y la base lo impide también por RLS: con su propio JWT, B no ve compras, lotes ni libro de A.
    const cliente = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${ownerB.token}` } } });
    const compraA = (await compras(A))[0];
    assert.ok(compraA);
    for (const t of ["purchases", "credit_lots", "credit_ledger", "credit_reservations", "company_credit_settings", "notifications", "agent_routines"]) {
      const { data } = await cliente.from(t).select("company_id").eq("company_id", A);
      assert.deepEqual(data, [], `B no ve filas de A en ${t}`);
    }
    const { data: propias } = await cliente.from("purchases").select("company_id");
    assert.ok((propias ?? []).every((x) => x.company_id === B), "B solo ve compras suyas");
    const { error } = await cliente.from("purchases").insert({ company_id: B, pack_id: "pro", modalidad: "unico", importe_centimos: 1, iva_centimos: 0 });
    assert.ok(error, "las compras no se pueden insertar desde el navegador");
    const miembro = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${memberB.token}` } } });
    assert.deepEqual((await miembro.from("purchases").select("id")).data, [], "un miembro (no admin) no ve las compras ni de su empresa");
  });
});

describe("GET /api/creditos/movimientos", () => {
  const movs = (u: Usuario | null, query = "") => movimientosHandler(peticion("GET", `movimientos${query}`, u?.token ?? null), deps()).then(leer);

  it("sin sesión: 401; filtros inválidos o con companyId: 400", async () => {
    assert.equal((await movs(null)).status, 401);
    assert.equal((await movs(ownerA, "?tipo=reserva")).status, 400);
    assert.equal((await movs(ownerA, `?companyId=${B}`)).status, 400);
    assert.equal((await movs(ownerA, "?porPagina=1000")).status, 400);
  });

  it("pagina, filtra por tipo, agrupa por operación y no muestra lo de otra empresa", async () => {
    const c = await empresa("movs");
    const u = await usuario(c, "owner", "movs");
    authUsers.push(u.id);
    await servicio.anadirCreditos(c, "inicio", "pack", null, `m:${randomUUID()}`);
    for (let i = 0; i < 5; i++) await servicio.cobrarConsumoFijo(c, "traspaso", {}, `m:${randomUUID()}`);
    const todos = await movs(u);
    assert.equal(todos.status, 200);
    assert.equal(todos.cuerpo.total, 6);
    const p1 = await movs(u, "?porPagina=4&pagina=1");
    const p2 = await movs(u, "?porPagina=4&pagina=2");
    assert.equal(p1.cuerpo.movimientos.length, 4);
    assert.equal(p2.cuerpo.movimientos.length, 2);
    assert.equal(p1.cuerpo.totalPaginas, 2);
    const ids = [...p1.cuerpo.movimientos, ...p2.cuerpo.movimientos].map((m: any) => m.id);
    assert.equal(new Set(ids).size, 6, "sin repetidos entre páginas");
    const soloCompras = await movs(u, "?tipo=compra");
    assert.equal(soloCompras.cuerpo.total, 1);
    assert.equal(soloCompras.cuerpo.movimientos[0].creditos, 5000);
    assert.equal((await movs(u, "?tipo=consumo")).cuerpo.total, 5);
    assert.equal((await movs(u, "?tipo=caducidad")).cuerpo.total, 0);
    const deOtra = JSON.stringify((await movs(ownerA)).cuerpo);
    assert.ok(!deOtra.includes(c));
    assert.ok(!JSON.stringify(todos.cuerpo).includes(A));
  });
});
