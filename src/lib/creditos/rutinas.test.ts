import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autorizarCron } from "./cronEntorno.ts";
import { oficinaPuedeEjecutar, proximaDespuesDe, siguienteEjecucion, sumarMeses } from "./rutinas.ts";

const d = (s: string) => new Date(s);
const iso = (x: Date) => x.toISOString();

describe("fechas de las rutinas", () => {
  it("sumarMeses respeta el fin de mes", () => {
    assert.equal(iso(sumarMeses(d("2027-01-31T08:00:00Z"), 1)), "2027-02-28T08:00:00.000Z");
    assert.equal(iso(sumarMeses(d("2028-01-31T08:00:00Z"), 1)), "2028-02-29T08:00:00.000Z");
    assert.equal(iso(sumarMeses(d("2026-12-15T08:00:00Z"), 1)), "2027-01-15T08:00:00.000Z");
  });
  it("siguiente ejecución por frecuencia", () => {
    const base = d("2026-11-06T08:00:00Z"); // viernes
    assert.equal(iso(siguienteEjecucion("cada_hora", base)), "2026-11-06T09:00:00.000Z");
    assert.equal(iso(siguienteEjecucion("diaria", base)), "2026-11-07T08:00:00.000Z");
    assert.equal(iso(siguienteEjecucion("semanal", base)), "2026-11-13T08:00:00.000Z");
    assert.equal(iso(siguienteEjecucion("mensual", base)), "2026-12-06T08:00:00.000Z");
    assert.equal(iso(siguienteEjecucion("laborables", base)), "2026-11-09T08:00:00.000Z", "del viernes salta al lunes");
  });
  it("tras una pausa larga no se acumulan ejecuciones atrasadas: la próxima es la primera futura", () => {
    const prox = proximaDespuesDe("diaria", d("2026-11-01T08:00:00Z"), d("2026-12-10T12:00:00Z"));
    assert.equal(iso(prox), "2026-12-11T08:00:00.000Z");
  });
});

describe("oficina que ejecuta agentes y rutinas", () => {
  it("solo activa y con saldo bajo", () => {
    assert.equal(oficinaPuedeEjecutar("activa"), true);
    assert.equal(oficinaPuedeEjecutar("saldo_bajo"), true);
    for (const e of ["sin_saldo", "pausada", "pendiente_borrado", "", null, undefined]) assert.equal(oficinaPuedeEjecutar(e), false, String(e));
  });
});

describe("autorización de las rutas de cron", () => {
  const env = { CRON_SECRET: "un-secreto-largo-de-prueba" };
  it("sin CRON_SECRET (o muy corto) la ruta está cerrada", () => {
    assert.deepEqual(autorizarCron("Bearer x", {}).ok, false);
    assert.equal((autorizarCron("Bearer corto", { CRON_SECRET: "corto" }) as { status: number }).status, 503);
  });
  it("exige el Bearer exacto", () => {
    assert.equal(autorizarCron(`Bearer ${env.CRON_SECRET}`, env).ok, true);
    assert.equal((autorizarCron("Bearer otro", env) as { status: number }).status, 401);
    assert.equal((autorizarCron(null, env) as { status: number }).status, 401);
    assert.equal((autorizarCron(env.CRON_SECRET, env) as { status: number }).status, 401, "sin la palabra Bearer");
  });
});
