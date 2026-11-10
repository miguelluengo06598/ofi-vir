/**
 * Pruebas de las tareas periódicas de créditos contra la base LOCAL real, con FECHAS SIMULADAS: cada tarea recibe
 * `ahora` por parámetro, así que no hay que esperar días. Cada prueba usa su propia empresa y limita la pasada a ella
 * (`empresaId`), para no tocar nunca otras empresas de la base local. Ejecutar: npm run test:creditos
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { ejecutarRutinasVencidas, listarRutinas, type Rutina } from "../../src/lib/creditos/rutinas.ts";
import { crearServicioCreditos } from "../../src/lib/creditos/servicio.ts";
import { caducarCreditos, ejecutarRutinas, renovarBonos, revisarEstados, type DepsTareas } from "../../src/lib/creditos/tareasPeriodicas.ts";
import { rutinaDePrueba } from "../ayuda/persona.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) throw new Error("Faltan variables de Supabase: ejecuta con `npm run test:creditos` (usa .env.local).");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Solo contra la base LOCAL (${url} no lo es).`);

const admin = createClient(url, key, { auth: { persistSession: false } });
const silencio = { info() {}, warn() {}, error() {} };
const svc = crearServicioCreditos({ db: admin, log: silencio, esLocal: true });
const RUN = Date.now().toString(36);
const T0 = new Date();
const dia = (n: number) => new Date(T0.getTime() + n * 86_400_000);
const horas = (n: number) => new Date(T0.getTime() + n * 3_600_000);

async function empresa(nombre: string) {
  const id = randomUUID();
  assert.ifError((await admin.from("companies").insert({ id, name: `test-creditos ${nombre} ${RUN}` })).error);
  return id;
}
async function lote(c: string, creditos: number, dias: number) {
  const { data, error } = await admin.rpc("anadir_lote", { p_company_id: c, p_origen: "regalo", p_creditos: creditos, p_dias_caducidad: dias, p_clave_idempotencia: `lote:${randomUUID()}` });
  assert.ifError(error);
  return (data as { lot_id: string }).lot_id;
}
const deps = (c: string, ahora: Date, extra: Partial<DepsTareas> = {}): DepsTareas => ({ db: admin, servicio: svc, ahora, esLocal: true, empresaId: c, log: silencio, ...extra });
const ajustes = async (c: string) =>
  (await admin.from("company_credit_settings").select("*").eq("company_id", c).single()).data as Record<string, string | null>;
const poner = async (c: string, cambios: Record<string, unknown>) => assert.ifError((await admin.from("company_credit_settings").update(cambios).eq("company_id", c)).error);
const notis = async (c: string, tipo: string) => ((await admin.from("notifications").select("id").eq("company_id", c).eq("tipo", tipo)).data ?? []).length;
const ms = (s: string | null) => Date.parse(s ?? "");

describe("caducar-creditos", () => {
  it("avisa 7 días antes (solo lotes con MÁS de 1.000 créditos, una vez) y caduca los vencidos", async () => {
    const c = await empresa("caducidad");
    await lote(c, 2000, 30); // avisa
    await lote(c, 1000, 30); // exactamente 1.000: no es «más de 1.000»
    await lote(c, 900, 30);  // no avisa
    let r = await caducarCreditos(deps(c, dia(22))); // faltan 8 días
    assert.equal(r.avisosEnviados, 0);
    r = await caducarCreditos(deps(c, dia(24))); // faltan 6 días
    assert.equal(r.avisosEnviados, 1);
    assert.equal(await notis(c, "lote_por_caducar"), 1);
    await caducarCreditos(deps(c, dia(25)));
    assert.equal(await notis(c, "lote_por_caducar"), 1, "el aviso no se repite");
    assert.equal((await svc.obtenerSaldo(c)).disponible, 3900, "antes de caducar no se toca nada");

    r = await caducarCreditos(deps(c, dia(31)));
    assert.equal(r.lotesCaducados, 3);
    assert.equal(r.creditosCaducados, 3900);
    assert.equal((await svc.obtenerSaldo(c)).disponible, 0);
    const { data } = await admin.from("credit_ledger").select("creditos").eq("company_id", c).eq("tipo", "caducidad");
    assert.deepEqual((data ?? []).map((l) => l.creditos).sort((a, b) => a - b), [-2000, -1000, -900]);
    assert.equal((await ajustes(c)).estado_oficina, "sin_saldo", "caducar baja el saldo: se revisa el estado");
    r = await caducarCreditos(deps(c, dia(32)));
    assert.equal(r.lotesCaducados, 0, "repetirla no caduca nada más");
  });
});

describe("revisar-estados: transiciones con fechas simuladas", () => {
  it("activa → pausada a los 60 días → pendiente de borrado a los 90 → borrado vencido a los 7 (sin borrar nada)", async () => {
    const c = await empresa("ciclo");
    await lote(c, 1000, 365);
    assert.ok((await admin.from("contacts").insert({ company_id: c, name: "Cliente de prueba", email: `cliente-${RUN}@prueba.example` })).error === null);

    assert.deepEqual((await revisarEstados(deps(c, dia(59)))).pausadas, []);
    assert.equal((await ajustes(c)).estado_oficina, "activa", "a los 59 días sigue activa");

    assert.deepEqual((await revisarEstados(deps(c, dia(61)))).pausadas, [c]);
    let a = await ajustes(c);
    assert.equal(a.estado_oficina, "pausada");
    assert.equal(ms(a.pausada_en), dia(61).getTime(), "guarda pausada_en");
    assert.equal(await notis(c, "oficina_pausada"), 1);
    await revisarEstados(deps(c, dia(61)));
    assert.equal(await notis(c, "oficina_pausada"), 1, "repetir la pasada no duplica el aviso");

    assert.deepEqual((await revisarEstados(deps(c, dia(61 + 89)))).pendientesDeBorrado, []);
    assert.equal((await ajustes(c)).estado_oficina, "pausada", "a los 89 días de pausa sigue pausada");

    assert.deepEqual((await revisarEstados(deps(c, dia(61 + 91)))).pendientesDeBorrado, [c]);
    a = await ajustes(c);
    assert.equal(a.estado_oficina, "pendiente_borrado");
    assert.equal(ms(a.borrado_programado_en), dia(61 + 91 + 7).getTime(), "borrado a 7 días vista");
    assert.equal(await notis(c, "borrado_programado"), 1);

    assert.deepEqual((await revisarEstados(deps(c, dia(61 + 91 + 6)))).borradoVencido, []);
    const r = await revisarEstados(deps(c, dia(61 + 91 + 8)));
    assert.deepEqual(r.borradoVencido, [c], "con la fecha cumplida se lista como vencido...");
    assert.equal(r.borradoEjecutado, false, "...pero NO se borra: el borrado no está implementado");
    assert.equal((await ajustes(c)).estado_oficina, "pendiente_borrado");
    assert.equal(((await admin.from("contacts").select("id").eq("company_id", c)).data ?? []).length, 1, "los datos siguen ahí");
    assert.equal(await notis(c, "borrado_programado"), 1);
  });

  it("sin_saldo se pausa con 60 días sin actividad, no antes", async () => {
    const c = await empresa("sinsaldo60");
    await svc.anadirCreditos(c, "inicio", "pack", "pi", `pago:${randomUUID()}`);
    const r = await svc.reservar(c, randomUUID(), 5000);
    await svc.confirmar(r.reservaId, 5000, { concepto: "tarea_experta" }); // deja la oficina sin saldo y registra actividad
    assert.equal((await ajustes(c)).estado_oficina, "sin_saldo");
    await revisarEstados(deps(c, dia(10)));
    assert.equal((await ajustes(c)).estado_oficina, "sin_saldo", "a los 10 días sigue en modo mínimo");
    await revisarEstados(deps(c, dia(59)));
    assert.equal((await ajustes(c)).estado_oficina, "sin_saldo");
    assert.deepEqual((await revisarEstados(deps(c, dia(61)))).pausadas, [c]);
    assert.equal((await ajustes(c)).estado_oficina, "pausada");
  });

  it("la actividad reciente evita la pausa", async () => {
    const c = await empresa("actividad");
    await lote(c, 1000, 365);
    await poner(c, { ultima_actividad_en: dia(50).toISOString() });
    await revisarEstados(deps(c, dia(61))); // 11 días desde la última actividad
    assert.equal((await ajustes(c)).estado_oficina, "activa");
  });

  it("una oficina ya pausada o pendiente no vuelve atrás por el paso del tiempo", async () => {
    const c = await empresa("sinretroceso");
    await poner(c, { estado_oficina: "pausada", pausada_en: dia(0).toISOString(), ultima_actividad_en: dia(-200).toISOString() });
    await revisarEstados(deps(c, dia(10)));
    const a = await ajustes(c);
    assert.equal(a.estado_oficina, "pausada");
    assert.equal(ms(a.pausada_en), dia(0).getTime(), "pausada_en no se pisa");
  });

  for (const origen of ["pausada", "pendiente_borrado"] as const) {
    it(`comprar créditos reactiva una oficina ${origen} y cancela el borrado`, async () => {
      const c = await empresa(`reactiva-${origen}`);
      await lote(c, 100, 365);
      await poner(c, {
        estado_oficina: origen, pausada_en: dia(-100).toISOString(), ultima_actividad_en: dia(-200).toISOString(),
        borrado_programado_en: origen === "pendiente_borrado" ? dia(3).toISOString() : null,
      });
      await svc.anadirCreditos(c, "inicio", "pack", "pi_reactiva", `pago:${randomUUID()}`);
      const a = await ajustes(c);
      assert.equal(a.estado_oficina, "activa");
      assert.equal(a.pausada_en, null);
      assert.equal(a.borrado_programado_en, null, "borrado cancelado");
      assert.ok(Date.now() - ms(a.ultima_actividad_en) < 60_000, "la inactividad se reinicia");
      // ...y la pasada siguiente no la vuelve a pausar ni a marcar para borrado.
      const r = await revisarEstados(deps(c, new Date()));
      assert.deepEqual([r.pausadas, r.pendientesDeBorrado, r.borradoVencido], [[], [], []]);
    });
  }
});

describe("renovar-bonos (simulado, solo local)", () => {
  it("añade el lote del bono cuando toca, una vez por periodo, y avanza la fecha", async () => {
    const c = await empresa("bono");
    await poner(c, { bono_mensual_pack_id: "inicio" });
    const toca = new Date((await ajustes(c)).bono_proxima_renovacion_en!);
    assert.ok(toca.getTime() > Date.now() + 27 * 86_400_000, "al activar el bono, la primera renovación es en ~1 mes");

    assert.equal((await renovarBonos(deps(c, dia(5)))).renovados, 0, "aún no toca");
    let r = await renovarBonos(deps(c, new Date(toca.getTime() + 86_400_000)));
    assert.equal(r.renovados, 1);
    const { data } = await admin.from("credit_lots").select("origen, creditos_iniciales, pack_id").eq("company_id", c);
    assert.deepEqual(data, [{ origen: "bono_mensual", creditos_iniciales: 5500, pack_id: "inicio" }], "+10 %: 5.500 en vez de 5.000");
    assert.equal(await notis(c, "bono_renovado"), 1);
    const sig = new Date((await ajustes(c)).bono_proxima_renovacion_en!);
    assert.ok(sig.getTime() > toca.getTime() + 27 * 86_400_000, "la próxima renovación avanza un mes");

    r = await renovarBonos(deps(c, new Date(toca.getTime() + 2 * 86_400_000)));
    assert.equal(r.renovados, 0, "no se renueva dos veces el mismo mes");

    // Reintento del mismo periodo (la fecha no llegó a avanzar): la clave evita el doble abono.
    await poner(c, { bono_proxima_renovacion_en: toca.toISOString() });
    r = await renovarBonos(deps(c, new Date(toca.getTime() + 3 * 86_400_000)));
    assert.equal(r.renovados, 0);
    assert.equal(((await admin.from("credit_lots").select("id").eq("company_id", c)).data ?? []).length, 1, "sigue habiendo un solo lote");

    // Al mes siguiente, otra renovación.
    r = await renovarBonos(deps(c, new Date(sig.getTime() + 86_400_000)));
    assert.equal(r.renovados, 1);
    assert.equal(((await admin.from("credit_lots").select("id").eq("company_id", c)).data ?? []).length, 2);
  });

  it("fuera de local no hace nada (lo hará el webhook de Stripe)", async () => {
    const c = await empresa("bono-prod");
    await poner(c, { bono_mensual_pack_id: "pro", bono_proxima_renovacion_en: dia(-1).toISOString() });
    const r = await renovarBonos(deps(c, dia(0), { esLocal: false }));
    assert.equal(r.omitido, "solo_local");
    assert.equal(((await admin.from("credit_lots").select("id").eq("company_id", c)).data ?? []).length, 0);
  });

  it("un pack sin bono mensual da error y no avanza la fecha", async () => {
    const c = await empresa("bono-malo");
    await poner(c, { bono_mensual_pack_id: "prueba", bono_proxima_renovacion_en: dia(-1).toISOString() });
    const r = await renovarBonos(deps(c, dia(0)));
    assert.equal(r.errores, 1);
    assert.equal(r.renovados, 0);
  });

  it("sin bono configurado no hay renovación pendiente", async () => {
    const c = await empresa("sin-bono");
    assert.equal((await ajustes(c)).bono_proxima_renovacion_en, null);
    assert.equal((await renovarBonos(deps(c, dia(400)))).renovados, 0);
  });
});

describe("rutinas", () => {
  async function agente(c: string) {
    const { data: dep, error: e1 } = await admin.from("departments").insert({ company_id: c, slug: "ventas", name: "Ventas" }).select("id").single();
    assert.ifError(e1);
    const { data, error } = await admin.from("agents").insert({
      company_id: c, department_id: dep!.id, slug: `agente-${RUN}`, name: "Agente de prueba", role: "Pruebas", creator_name: "Pruebas",
      model: "claude-haiku-5-5", allowed_tools: [], instructions: "Eres un agente de pruebas.",
    }).select("id").single();
    assert.ifError(error);
    return data!.id as string;
  }
  async function rutina(c: string, agentId: string, o: { tipo?: string; frecuencia?: string; proxima: Date; nombre?: string }) {
    // Una rutina la crea y la activa una persona (lo exige la base).
    const { data, error } = await rutinaDePrueba(admin, {
      company_id: c, agent_id: agentId, nombre: o.nombre ?? "Rutina", instruccion: "Haz tu ronda.",
      tipo_tarea: o.tipo ?? "simple", frecuencia: o.frecuencia ?? "diaria", proxima_ejecucion_en: o.proxima.toISOString(),
    });
    assert.ifError(error);
    return data!.id as string;
  }
  const fila = async (id: string) => (await admin.from("agent_routines").select("*").eq("id", id).single()).data as Record<string, string | null>;

  it("muestra su coste estimado al mes con estimarCreditosRutina", async () => {
    const c = await empresa("rutina-coste");
    const a = await agente(c);
    await rutina(c, a, { tipo: "simple", frecuencia: "diaria", proxima: dia(1), nombre: "Diaria simple" });
    await rutina(c, a, { tipo: "estandar", frecuencia: "laborables", proxima: dia(1), nombre: "Laborables estándar" });
    await rutina(c, a, { tipo: "experta", frecuencia: "mensual", proxima: dia(1), nombre: "Mensual experta" });
    const costes = Object.fromEntries((await listarRutinas(admin, c)).map((r) => [r.nombre, r.costeMensualEstimado]));
    assert.deepEqual(costes, { "Diaria simple": 60, "Laborables estándar": 220, "Mensual experta": 50 });
  });

  it("oficina activa: se lanza una vez y su calendario avanza; sin más vencidas no hace nada", async () => {
    const c = await empresa("rutina-activa");
    const a = await agente(c);
    const id = await rutina(c, a, { proxima: horas(-1) });
    const lanzadas: string[] = [];
    const r = await ejecutarRutinasVencidas({ db: admin, ahora: T0, empresaId: c, log: silencio, lanzar: async (x: Rutina) => void lanzadas.push(x.id) });
    assert.equal(r.lanzadas, 1);
    assert.deepEqual(lanzadas, [id]);
    const f = await fila(id);
    assert.ok(ms(f.proxima_ejecucion_en) > T0.getTime());
    assert.equal(ms(f.ultima_ejecucion_en), T0.getTime());
    const r2 = await ejecutarRutinasVencidas({ db: admin, ahora: T0, empresaId: c, log: silencio, lanzar: async () => assert.fail("no debía lanzarse") });
    assert.equal(r2.vencidas, 0);
  });

  for (const [estado, ejecuta] of [["activa", true], ["saldo_bajo", true], ["sin_saldo", false], ["pausada", false], ["pendiente_borrado", false]] as const) {
    it(`oficina ${estado}: ${ejecuta ? "las rutinas se ejecutan" : "las rutinas NO se ejecutan (y su calendario avanza sin acumular atrasadas)"}`, async () => {
      const c = await empresa(`rutina-${estado}`);
      const a = await agente(c);
      await poner(c, { estado_oficina: estado });
      const id = await rutina(c, a, { proxima: dia(-30) }); // llevaba 30 días vencida
      let n = 0;
      const r = await ejecutarRutinasVencidas({ db: admin, ahora: T0, empresaId: c, log: silencio, lanzar: async () => void n++ });
      assert.equal(n, ejecuta ? 1 : 0);
      assert.equal(r.omitidasPorOficina, ejecuta ? 0 : 1);
      const f = await fila(id);
      assert.ok(ms(f.proxima_ejecucion_en) > T0.getTime(), "la próxima es futura: no hay 30 ejecuciones atrasadas esperando");
      assert.equal(f.ultima_ejecucion_en !== null, ejecuta);
    });
  }

  it("dos pasadas a la vez no lanzan la misma rutina dos veces", async () => {
    const c = await empresa("rutina-paralelo");
    const a = await agente(c);
    await rutina(c, a, { proxima: horas(-1) });
    let n = 0;
    const lanzar = async () => { n++; };
    await Promise.all([1, 2, 3].map(() => ejecutarRutinasVencidas({ db: admin, ahora: T0, empresaId: c, log: silencio, lanzar })));
    assert.equal(n, 1);
  });

  it("sin lanzador solo informa y no toca el calendario; si el lanzador falla se cuenta el error", async () => {
    const c = await empresa("rutina-seco");
    const a = await agente(c);
    const id = await rutina(c, a, { proxima: horas(-1) });
    const antes = (await fila(id)).proxima_ejecucion_en;
    const r = await ejecutarRutinas(deps(c, T0));
    assert.deepEqual(r.pendientesDeLanzar, [id]);
    assert.equal((await fila(id)).proxima_ejecucion_en, antes);
    const r2 = await ejecutarRutinas(deps(c, T0, { lanzarRutina: async () => { throw new Error("boom"); } }));
    assert.equal(r2.errores, 1);
    assert.equal(r2.lanzadas, 0);
  });
});
