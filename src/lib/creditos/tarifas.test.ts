import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { limpiarCachePacks, getPacks, getPack } from "./packs.ts";
import {
  calcularCosteIA, CONSUMOS_FIJOS, creditosParaTarea, estimarCreditosRutina, evaluarMargen, leerPrecios, MODELOS,
  resolverModelo, TIPOS_DE_TAREA, UMBRAL_ALERTA_MARGEN, valorCreditoUsdMicros,
} from "./tarifas.ts";

const P = leerPrecios({}); // precios por defecto
const H = MODELOS.haiku;
const S = MODELOS.sonnet;

describe("calcularCosteIA (millonésimas de dólar)", () => {
  it("Haiku: 1 M de entrada = 0,10 $ y 1 M de salida = 0,50 $", () => {
    assert.equal(calcularCosteIA(H, 1_000_000, 0, 0, P), 100_000);
    assert.equal(calcularCosteIA(H, 0, 1_000_000, 0, P), 500_000);
  });
  it("Sonnet: 2 $ de entrada, 10 $ de salida, 0,10 $ de caché por millón", () => {
    assert.equal(calcularCosteIA(S, 1_000_000, 0, 0, P), 2_000_000);
    assert.equal(calcularCosteIA(S, 0, 1_000_000, 0, P), 10_000_000);
    assert.equal(calcularCosteIA(S, 0, 0, 1_000_000, P), 100_000);
  });
  it("suma entrada, salida y caché", () => {
    // 12 000·2 + 800·10 + 50 000·0,1 = 24 000 + 8 000 + 5 000
    assert.equal(calcularCosteIA(S, 12_000, 800, 50_000, P), 37_000);
  });
  it("devuelve siempre un entero y redondea hacia arriba (nunca subestima)", () => {
    const c = calcularCosteIA(H, 1, 0, 0, P); // 0,1 micro-dólares
    assert.equal(c, 1);
    assert.ok(Number.isInteger(calcularCosteIA(S, 1234, 567, 89, P)));
  });
  it("sin tokens cuesta 0", () => assert.equal(calcularCosteIA(H, 0, 0, 0, P), 0));
  it("tokensCache es opcional", () => assert.equal(calcularCosteIA(H, 1_000_000, 0, undefined, P), 100_000));
  it("rechaza modelos sin precio y tokens no válidos", () => {
    assert.throws(() => calcularCosteIA("claude-otro", 1, 1, 0, P), /No hay precios/);
    assert.throws(() => calcularCosteIA(H, -1, 0, 0, P));
    assert.throws(() => calcularCosteIA(H, 1.5, 0, 0, P));
    assert.throws(() => calcularCosteIA(H, 0, Number.NaN, 0, P));
  });
  it("los precios se pueden cambiar por variables de entorno y se validan", () => {
    const caro = leerPrecios({ PRECIO_HAIKU_ENTRADA_USD: "1" });
    assert.equal(calcularCosteIA(H, 1_000_000, 0, 0, caro), 1_000_000);
    assert.throws(() => leerPrecios({ PRECIO_HAIKU_ENTRADA_USD: "gratis" }), /PRECIO_HAIKU_ENTRADA_USD/);
    assert.throws(() => leerPrecios({ PRECIO_SONNET_SALIDA_USD: "-3" }), /PRECIO_SONNET_SALIDA_USD/);
    assert.deepEqual(leerPrecios({ PRECIO_HAIKU_ENTRADA_USD: "" }), P, "vacío = valor por defecto");
  });
});

describe("tarifas de tarea", () => {
  it("simple 2, estándar 10, experta 50", () => {
    assert.equal(creditosParaTarea("simple"), 2);
    assert.equal(creditosParaTarea("estandar"), 10);
    assert.equal(creditosParaTarea("experta"), 50);
  });
  it("tipo desconocido falla", () => {
    assert.throws(() => creditosParaTarea("gigante" as never));
  });
  it("consumos fijos: traspaso 1, correo 1, whatsapp provisional", () => {
    assert.equal(CONSUMOS_FIJOS.traspaso, 1);
    assert.equal(CONSUMOS_FIJOS.correo, 1);
    assert.equal(CONSUMOS_FIJOS.whatsapp, 5);
  });
  it("todo son enteros y cada modelo de cada tipo tiene precio", () => {
    for (const t of Object.values(TIPOS_DE_TAREA)) {
      for (const n of [t.creditos, t.maxPasos, t.maxTokensSalida]) assert.ok(Number.isInteger(n) && n > 0);
      for (const m of t.modelosPermitidos) assert.ok(P[m], `precio de ${m}`);
      assert.ok(t.modelosPermitidos.includes(t.modeloPorDefecto));
    }
  });
  it("las tareas más caras tienen más margen de pasos y tokens", () => {
    assert.ok(TIPOS_DE_TAREA.simple.maxPasos < TIPOS_DE_TAREA.estandar.maxPasos);
    assert.ok(TIPOS_DE_TAREA.estandar.maxPasos < TIPOS_DE_TAREA.experta.maxPasos);
  });
  it("el modelo: estándar admite Sonnet si el agente lo pide; simple y experta no cambian", () => {
    assert.equal(resolverModelo("simple", S), H);
    assert.equal(resolverModelo("estandar", null), H);
    assert.equal(resolverModelo("estandar", S), S);
    assert.equal(resolverModelo("estandar", "claude-desconocido"), H);
    assert.equal(resolverModelo("experta", H), S);
  });
});

describe("estimarCreditosRutina", () => {
  it("créditos de la tarea × ejecuciones al mes", () => {
    assert.equal(estimarCreditosRutina("simple", 30), 60);
    assert.equal(estimarCreditosRutina("estandar", 22), 220);
    assert.equal(estimarCreditosRutina("experta", 4), 200);
  });
  it("cero ejecuciones = cero créditos", () => assert.equal(estimarCreditosRutina("experta", 0), 0));
  it("rechaza decimales, negativos y valores absurdos", () => {
    assert.throws(() => estimarCreditosRutina("simple", 1.5));
    assert.throws(() => estimarCreditosRutina("simple", -1));
    assert.throws(() => estimarCreditosRutina("simple", Number.NaN));
    assert.throws(() => estimarCreditosRutina("simple", Number.POSITIVE_INFINITY));
    assert.throws(() => estimarCreditosRutina("simple", 10_000_000));
  });
});

describe("alerta de margen", () => {
  it("un crédito vale 10 800 micro-dólares con el cambio por defecto", () => assert.equal(valorCreditoUsdMicros({}), 10_800));
  it("el umbral es el 50 %", () => assert.equal(UMBRAL_ALERTA_MARGEN, 0.5));
  it("salta solo cuando el coste supera la mitad de lo cobrado", () => {
    const mitad = 2 * 10_800 * 0.5; // tarea simple: 10 800
    assert.equal(evaluarMargen(2, mitad, {}).alerta, false, "exactamente el 50 % no alerta");
    assert.equal(evaluarMargen(2, mitad + 1, {}).alerta, true);
    assert.equal(evaluarMargen(50, 1000, {}).alerta, false);
  });
  it("sin créditos cobrados y con coste, alerta", () => assert.equal(evaluarMargen(0, 5, {}).alerta, true));
  it("el cambio de moneda se lee del entorno y se valida", () => {
    assert.equal(valorCreditoUsdMicros({ CAMBIO_USD_POR_EUR: "1.2" }), 12_000);
    assert.throws(() => valorCreditoUsdMicros({ CAMBIO_USD_POR_EUR: "abc" }));
  });
});

describe("getPacks (caché)", () => {
  beforeEach(() => limpiarCachePacks());
  const fila = (id: string, precio: number, activo = true) => ({
    id, nombre: id, precio_centimos: precio, creditos: precio, creditos_bono_mensual: null, dias_caducidad: 365, solo_una_vez: false, activo,
  });
  it("lee una vez, ordena por precio, oculta inactivos y cachea 5 minutos", async () => {
    let lecturas = 0;
    const fuente = async () => { lecturas++; return [fila("pro", 14900), fila("inicio", 4900), fila("business", 39900, false)]; };
    const a = await getPacks({ fuente, ahora: 0 });
    assert.deepEqual(a.map((p) => p.id), ["inicio", "pro"]);
    await getPacks({ fuente, ahora: 60_000 });
    assert.equal(lecturas, 1);
    assert.equal((await getPack("pro", { fuente, ahora: 60_000 }))?.precioCentimos, 14900);
    await getPacks({ fuente, ahora: 5 * 60_000 + 1 });
    assert.equal(lecturas, 2);
  });
  it("lecturas simultáneas comparten una sola consulta", async () => {
    let lecturas = 0;
    const fuente = async () => { lecturas++; return [fila("inicio", 4900)]; };
    await Promise.all([getPacks({ fuente }), getPacks({ fuente }), getPacks({ fuente })]);
    assert.equal(lecturas, 1);
  });
  it("valida las filas y no cachea los errores", async () => {
    await assert.rejects(getPacks({ fuente: async () => [{ ...fila("inicio", 4900), creditos: 10.5 }] }));
    const ok = await getPacks({ fuente: async () => [fila("inicio", 4900)] });
    assert.equal(ok.length, 1);
  });
});

import { CICLO_DE_VIDA, costeMensualRutina, ejecucionesPorMes } from "./tarifas.ts";

describe("rutinas: coste estimado al mes", () => {
  it("ejecuciones por mes de cada frecuencia", () => {
    assert.equal(ejecucionesPorMes("diaria"), 30);
    assert.equal(ejecucionesPorMes("laborables"), 22);
    assert.equal(ejecucionesPorMes("semanal"), 5);
    assert.equal(ejecucionesPorMes("mensual"), 1);
    assert.equal(ejecucionesPorMes("cada_hora"), 720);
    assert.throws(() => ejecucionesPorMes("a_veces" as never));
  });
  it("coste = tarifa del tipo × ejecuciones al mes (entero)", () => {
    assert.equal(costeMensualRutina("simple", "diaria"), 60);
    assert.equal(costeMensualRutina("estandar", "laborables"), 220);
    assert.equal(costeMensualRutina("experta", "semanal"), 250);
    assert.equal(costeMensualRutina("experta", "mensual"), 50);
  });
});

describe("ciclo de vida", () => {
  it("umbrales de las tareas periódicas", () => {
    assert.deepEqual({ ...CICLO_DE_VIDA }, {
      avisoCaducidadDias: 7, avisoCaducidadMinCreditos: 1000,
      diasSinActividadParaPausar: 60, diasPausadaParaBorrado: 90, diasDeGraciaBorrado: 7,
    });
  });
});
