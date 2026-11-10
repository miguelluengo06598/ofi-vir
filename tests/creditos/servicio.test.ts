/**
 * Pruebas del servicio de créditos contra la base de datos LOCAL real (Supabase en Docker).
 * Cada prueba crea su propia empresa. El libro contable es de solo inserción, así que esas empresas NO se borran
 * (se llaman «test-creditos …»); `supabase db reset` las elimina. Ejecutar: npm run test:creditos
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { crearServicioCreditos, CreditosError } from "../../src/lib/creditos/servicio.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) throw new Error("Faltan variables de Supabase: ejecuta con `npm run test:creditos` (usa .env.local).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);

const admin = createClient(url, key, { auth: { persistSession: false } });
const silencio = { info() {}, warn() {}, error() {} };
const svc = crearServicioCreditos({ db: admin, log: silencio, esLocal: true });
const RUN = Date.now().toString(36);

async function empresa(nombre: string) {
  const id = randomUUID();
  const { error } = await admin.from("companies").insert({ id, name: `test-creditos ${nombre} ${RUN}` });
  assert.ifError(error);
  return id;
}
/** Lote de regalo de `creditos` que caduca dentro de `dias`. */
async function lote(company: string, creditos: number, dias: number) {
  const { data, error } = await admin.rpc("anadir_lote", {
    p_company_id: company, p_origen: "regalo", p_creditos: creditos, p_dias_caducidad: dias, p_clave_idempotencia: `lote:${randomUUID()}`,
  });
  assert.ifError(error);
  return (data as { lot_id: string }).lot_id;
}
const disponible = async (c: string) => (await svc.obtenerSaldo(c)).disponible;
const ajustar = async (c: string, cambios: Record<string, unknown>) =>
  assert.ifError((await admin.from("company_credit_settings").update(cambios).eq("company_id", c)).error);
const notificaciones = async (c: string, tipo?: string) => {
  let q = admin.from("notifications").select("tipo").eq("company_id", c);
  if (tipo) q = q.eq("tipo", tipo);
  return (await q).data ?? [];
};
/** Gasta `n` créditos reales con reserva + confirmación (concepto de tarea experta). */
async function gastar(c: string, n: number) {
  const r = await svc.reservar(c, randomUUID(), n);
  return svc.confirmar(r.reservaId, n, { concepto: "tarea_experta" });
}
const falla = (codigo: string) => (e: unknown) => e instanceof CreditosError && e.codigo === codigo;

describe("servicio de créditos (base local)", () => {
  it("consumo FIFO: se gasta primero el lote que caduca antes (aunque se creara después)", async () => {
    const c = await empresa("fifo");
    const tarde = await lote(c, 100, 30);
    const pronto = await lote(c, 100, 5);
    await gastar(c, 150);
    const { data } = await admin.from("credit_lots").select("id, creditos_restantes").eq("company_id", c);
    const rest = Object.fromEntries((data ?? []).map((l) => [l.id, l.creditos_restantes]));
    assert.equal(rest[pronto], 0, "el que caduca antes, vacío");
    assert.equal(rest[tarde], 50, "el resto sale del siguiente");
    const { data: lineas } = await admin.from("credit_ledger").select("creditos").eq("company_id", c).eq("tipo", "consumo");
    assert.deepEqual((lineas ?? []).map((l) => l.creditos).sort((a, b) => a - b), [-100, -50], "una línea por lote tocado");
    const s = await svc.obtenerSaldo(c);
    assert.equal(s.disponible, 50);
    assert.equal(s.lotes.length, 1, "el lote vacío ya no aparece");
    assert.equal(s.consumidosEsteMes, 150);
  });

  it("un consumo mayor que el saldo no descuenta nada (en la base y en el servicio)", async () => {
    const c = await empresa("sobrepasa");
    await lote(c, 100, 30);
    const { error } = await admin.rpc("consumir_creditos", { p_company_id: c, p_creditos: 101, p_concepto: "tarea_simple" });
    assert.equal(error?.code, "CR001");
    assert.match(error?.message ?? "", /SALDO_INSUFICIENTE/);
    assert.equal(await disponible(c), 100);
    await assert.rejects(svc.reservar(c, randomUUID(), 101), falla("sin_saldo"));
    assert.equal(await disponible(c), 100);
    assert.equal((await svc.obtenerSaldo(c)).consumidosEsteMes, 0);
  });

  it("dos consumos simultáneos que juntos superan el saldo: solo uno pasa", async () => {
    const c = await empresa("paralelo2");
    await lote(c, 100, 30);
    const r = await Promise.allSettled([
      admin.rpc("consumir_creditos", { p_company_id: c, p_creditos: 60, p_concepto: "tarea_estandar", p_clave_idempotencia: `p:${randomUUID()}` }),
      admin.rpc("consumir_creditos", { p_company_id: c, p_creditos: 60, p_concepto: "tarea_estandar", p_clave_idempotencia: `p:${randomUUID()}` }),
    ]);
    const resultados = r.map((x) => (x.status === "fulfilled" ? x.value : { error: { code: "rechazada" } }));
    assert.equal(resultados.filter((x) => !x.error).length, 1, "solo uno se cobra");
    assert.equal(resultados.filter((x) => x.error?.code === "CR001").length, 1, "el otro recibe SALDO_INSUFICIENTE");
    assert.equal(await disponible(c), 40);
  });

  it("también a través del servicio: reservas simultáneas, y con 10 peticiones de 30 sobre 100 solo pasan 3", async () => {
    const c = await empresa("paralelo10");
    await lote(c, 100, 30);
    const r = await Promise.allSettled(Array.from({ length: 10 }, () => svc.reservar(c, randomUUID(), 30)));
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 3);
    for (const x of r) if (x.status === "rejected") assert.ok(falla("sin_saldo")(x.reason), String(x.reason));
    const s = await svc.obtenerSaldo(c);
    assert.equal(s.reservado, 90);
    assert.equal(s.disponible, 10);
    assert.ok(s.disponible >= 0);
  });

  it("reintento con la misma clave de idempotencia: se cobra una sola vez", async () => {
    const c = await empresa("idem");
    await lote(c, 100, 30);
    const clave = `correo:${randomUUID()}`;
    const a = await svc.cobrarConsumoFijo(c, "correo", {}, clave);
    const b = await svc.cobrarConsumoFijo(c, "correo", {}, clave);
    assert.equal(a.duplicado, false);
    assert.equal(b.duplicado, true);
    assert.equal(b.operacionId, a.operacionId);
    assert.equal(await disponible(c), 99, "solo 1 crédito (el correo vale 1)");
    // Cinco reintentos a la vez con otra clave: un solo cobro.
    const k2 = `traspaso:${randomUUID()}`;
    await Promise.all(Array.from({ length: 5 }, () => svc.cobrarConsumoFijo(c, "traspaso", {}, k2)));
    assert.equal(await disponible(c), 98);
    // Reintentar una confirmación y una compra tampoco cobra ni añade dos veces.
    const r = await svc.reservar(c, randomUUID(), 10);
    const c1 = await svc.confirmar(r.reservaId, 10, { tipo: "estandar" });
    const c2 = await svc.confirmar(r.reservaId, 10, { tipo: "estandar" });
    assert.equal(c1.duplicado, false);
    assert.equal(c2.duplicado, true);
    assert.equal(await disponible(c), 88);
    const kc = `pago:${randomUUID()}`;
    const l1 = await svc.anadirCreditos(c, "inicio", "pack", "pi_test", kc);
    const l2 = await svc.anadirCreditos(c, "inicio", "pack", "pi_test", kc);
    assert.equal(l2.duplicado, true);
    assert.equal(l2.loteId, l1.loteId);
    assert.equal(await disponible(c), 88 + 5000);
  });

  it("reserva confirmada por menos de lo reservado: se libera la diferencia, y la reserva caduca a los 15 minutos", async () => {
    const c = await empresa("reserva");
    await lote(c, 1000, 30);
    const r = await svc.reservar(c, randomUUID(), 50);
    assert.equal((await svc.obtenerSaldo(c)).disponible, 950, "lo reservado deja de estar disponible");
    const { data: fila } = await admin.from("credit_reservations").select("creado_en, expira_en").eq("id", r.reservaId).single();
    const minutos = (Date.parse(fila!.expira_en) - Date.parse(fila!.creado_en)) / 60_000;
    assert.ok(Math.abs(minutos - 15) < 0.1, `expira a los 15 min (${minutos})`);
    const conf = await svc.confirmar(r.reservaId, 20, { tipo: "simple" });
    assert.equal(conf.consumido, 20);
    assert.equal(conf.liberado, 30);
    const s = await svc.obtenerSaldo(c);
    assert.equal(s.disponible, 980);
    assert.equal(s.reservado, 0);
    await assert.rejects(svc.confirmar(r.reservaId, 5, { tipo: "simple", claveIdempotencia: "otra-clave-distinta" }), falla("reserva_no_activa"));
    await assert.rejects(svc.confirmar(randomUUID(), 1, { tipo: "simple" }), falla("reserva_no_encontrada"));
  });

  it("liberar: no se cobra nada y repetirlo es seguro", async () => {
    const c = await empresa("liberar");
    await lote(c, 100, 30);
    const r = await svc.reservar(c, randomUUID(), 40);
    const a = await svc.liberar(r.reservaId);
    assert.equal(a.liberado, 40);
    assert.equal(await disponible(c), 100);
    assert.equal((await svc.liberar(r.reservaId)).duplicado, true);
    assert.equal((await svc.obtenerSaldo(c)).consumidosEsteMes, 0);
  });

  it("reservar dos veces la misma tarea devuelve la misma reserva", async () => {
    const c = await empresa("reserva-idem");
    await lote(c, 100, 30);
    const t = randomUUID();
    const a = await svc.reservar(c, t, 60);
    const b = await svc.reservar(c, t, 60); // 60 + 60 > 100, pero es un reintento: no debe fallar
    assert.equal(b.duplicado, true);
    assert.equal(b.reservaId, a.reservaId);
    assert.equal((await svc.obtenerSaldo(c)).reservado, 60);
  });

  it("puedeGastar: sin saldo, oficina pausada y tope mensual", async () => {
    const c = await empresa("puede");
    assert.deepEqual((await svc.puedeGastar(c, 1)).motivo, "sin_saldo");
    await lote(c, 1000, 30);
    assert.equal((await svc.puedeGastar(c, 1)).ok, true);
    await ajustar(c, { tope_mensual_creditos: 100 });
    await gastar(c, 90);
    assert.equal((await svc.puedeGastar(c, 10)).ok, true, "90 + 10 = 100: dentro del tope");
    const sobre = await svc.puedeGastar(c, 11);
    assert.equal(sobre.ok, false);
    assert.equal(sobre.motivo, "tope_mensual");
    await assert.rejects(svc.cobrarConsumoFijo(c, "whatsapp", {}, `wa:${randomUUID()}`).then(() => svc.reservar(c, randomUUID(), 6)), falla("tope_mensual"));
    await ajustar(c, { tope_mensual_creditos: null });
    assert.equal((await svc.puedeGastar(c, 11)).ok, true, "sin tope vuelve a poder");
    await ajustar(c, { estado_oficina: "pausada" });
    assert.equal((await svc.puedeGastar(c, 1)).motivo, "oficina_pausada");
    await assert.rejects(svc.reservar(c, randomUUID(), 1), falla("oficina_pausada"));
    await assert.rejects(svc.puedeGastar(c, 0), falla("entrada_invalida"));
  });

  it("los avisos del 20 % y del 5 % se registran una sola vez, hasta que haya una compra nueva", async () => {
    const c = await empresa("avisos");
    await svc.anadirCreditos(c, "inicio", "pack", "pi_avisos", `pago:${randomUUID()}`); // base: 5.000
    await gastar(c, 3999);
    assert.equal((await notificaciones(c)).length, 0, "20,02 % restante: sin avisos");
    await gastar(c, 1); // quedan 1.000 = 20 %
    assert.equal((await notificaciones(c, "saldo_bajo_20")).length, 1);
    await gastar(c, 50); // 950: sigue por debajo del 20 %, no se repite
    assert.equal((await notificaciones(c, "saldo_bajo_20")).length, 1);
    await gastar(c, 700); // quedan 250 = 5 %
    assert.equal((await notificaciones(c, "saldo_bajo_5")).length, 1);
    await gastar(c, 10);
    await gastar(c, 10);
    assert.equal((await notificaciones(c)).length, 2, "un aviso de cada y nada más");
    const { data: aj } = await admin.from("company_credit_settings").select("estado_oficina, aviso_20_enviado_en, aviso_5_enviado_en").eq("company_id", c).single();
    assert.equal(aj!.estado_oficina, "saldo_bajo");
    assert.ok(aj!.aviso_20_enviado_en && aj!.aviso_5_enviado_en);
    // Compra nueva: se reinician los avisos y la oficina vuelve a estar activa.
    await svc.anadirCreditos(c, "inicio", "pack", "pi_avisos_2", `pago:${randomUUID()}`);
    const { data: aj2 } = await admin.from("company_credit_settings").select("estado_oficina, aviso_20_enviado_en, aviso_5_enviado_en").eq("company_id", c).single();
    assert.equal(aj2!.estado_oficina, "activa");
    assert.equal(aj2!.aviso_20_enviado_en, null);
    assert.equal(aj2!.aviso_5_enviado_en, null);
    const s = await svc.obtenerSaldo(c);
    await gastar(c, s.disponible - 1000); // otra vez al 20 % del último lote
    assert.equal((await notificaciones(c, "saldo_bajo_20")).length, 2, "tras la compra nueva, el aviso vuelve a poder salir");
  });

  it("un consumo que cruza los dos umbrales de golpe avisa solo del 5 %", async () => {
    const c = await empresa("salto");
    await svc.anadirCreditos(c, "inicio", "pack", "pi_salto", `pago:${randomUUID()}`);
    await gastar(c, 4800); // de 100 % a 4 %
    assert.equal((await notificaciones(c, "saldo_bajo_5")).length, 1);
    assert.equal((await notificaciones(c, "saldo_bajo_20")).length, 0);
    await gastar(c, 100); // quedan 100: el 20 % no debe salir después
    assert.equal((await notificaciones(c, "saldo_bajo_20")).length, 0);
  });

  it("a 0 créditos la oficina pasa a sin_saldo, avisa una vez y se reactiva al comprar", async () => {
    const c = await empresa("sinsaldo");
    await svc.anadirCreditos(c, "inicio", "pack", "pi_sin", `pago:${randomUUID()}`);
    await gastar(c, 5000);
    const est = async () => (await admin.from("company_credit_settings").select("estado_oficina, ultima_actividad_en").eq("company_id", c).single()).data!;
    assert.equal((await est()).estado_oficina, "sin_saldo");
    assert.equal((await notificaciones(c, "sin_saldo")).length, 1);
    assert.equal((await svc.puedeGastar(c, 1)).motivo, "sin_saldo");
    await svc.anadirCreditos(c, "pro", "pack", "pi_sin_2", `pago:${randomUUID()}`);
    assert.equal((await est()).estado_oficina, "activa");
    assert.equal((await notificaciones(c, "sin_saldo")).length, 1);
  });

  it("cada consumo actualiza ultima_actividad_en", async () => {
    const c = await empresa("actividad");
    await lote(c, 100, 30);
    const antes = (await admin.from("company_credit_settings").select("ultima_actividad_en").eq("company_id", c).single()).data!.ultima_actividad_en;
    await new Promise((r) => setTimeout(r, 20));
    await svc.cobrarConsumoFijo(c, "correo", {}, `correo:${randomUUID()}`);
    const despues = (await admin.from("company_credit_settings").select("ultima_actividad_en").eq("company_id", c).single()).data!.ultima_actividad_en;
    assert.ok(Date.parse(despues) > Date.parse(antes));
  });

  it("recarga automática (local): al bajar del umbral crea un lote simulado, una sola vez por episodio", async () => {
    const c = await empresa("recarga");
    await lote(c, 1000, 30);
    await ajustar(c, { recarga_auto_activa: true, recarga_auto_umbral: 500, recarga_auto_pack_id: "inicio" });
    await gastar(c, 400);
    assert.equal(await disponible(c), 600, "por encima del umbral: no recarga");
    await gastar(c, 200); // 400 < 500
    const s = await svc.obtenerSaldo(c);
    assert.equal(s.disponible, 400 + 5000, "lote simulado del pack Inicio");
    assert.equal(s.lotes.filter((l) => l.packId === "inicio").length, 1);
    assert.equal((await notificaciones(c, "recarga_automatica")).length, 1);
    const { data: lotes } = await admin.from("credit_lots").select("referencia_pago").eq("company_id", c).eq("pack_id", "inicio");
    assert.match(lotes![0].referencia_pago ?? "", /^simulado:recarga_auto:/);
  });

  it("si la recarga automática falla, el cobro sigue en pie y queda una alerta interna", async () => {
    const c = await empresa("recarga-falla");
    await lote(c, 1000, 30);
    await ajustar(c, { recarga_auto_activa: true, recarga_auto_umbral: 500, recarga_auto_pack_id: "inicio" });
    const fallido = crearServicioCreditos({ db: admin, log: silencio, esLocal: true, iniciarRecarga: async () => { throw new Error("pago rechazado"); } });
    const r = await fallido.reservar(c, randomUUID(), 600);
    await fallido.confirmar(r.reservaId, 600, { concepto: "tarea_experta" }); // 400 < 500: intenta recargar y falla
    assert.equal((await fallido.obtenerSaldo(c)).disponible, 400, "el cobro se hizo");
    const { data } = await admin.from("internal_alerts").select("tipo, detalle").eq("company_id", c);
    assert.deepEqual((data ?? []).map((a) => a.tipo), ["recarga_fallida"]);
    assert.equal((data![0].detalle as { pack: string }).pack, "inicio");
  });
});
