/** Salud, filtros y permisos de la ficha de clientes (sin base de datos). Ejecutar: npm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { puedeHacer } from "./clientes/config.ts";
import { filtrarClientes, leerFiltros, type Cliente } from "./clientes/listado.ts";
import { calcularSalud, type EntradaSalud } from "./clientes/salud.ts";

const AHORA = new Date("2026-11-10T12:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString();
const sana: EntradaSalud = { estadoEmpresa: "activa", estadoOficina: "activa", ultimaActividad: hace(1), saldo: 5000, valoracionesNegativas: 0, valoracionesTotal: 4, agentesSuspendidos: 0, recargasFallidas: 0 };

describe("calcularSalud", () => {
  it("verde cuando todo está bien, con el porqué", () => {
    const s = calcularSalud(sana, AHORA);
    assert.equal(s.color, "verde");
    assert.ok(s.senales.some((x) => /hace 1 día/.test(x.texto)));
  });
  it("ámbar por saldo bajo, una valoración negativa o una semana sin actividad", () => {
    assert.equal(calcularSalud({ ...sana, estadoOficina: "saldo_bajo" }, AHORA).color, "ambar");
    assert.equal(calcularSalud({ ...sana, valoracionesNegativas: 1 }, AHORA).color, "ambar");
    assert.equal(calcularSalud({ ...sana, ultimaActividad: hace(8) }, AHORA).color, "ambar");
    assert.equal(calcularSalud({ ...sana, ultimaActividad: hace(7) }, AHORA).color, "verde");
    assert.equal(calcularSalud({ ...sana, agentesSuspendidos: 1 }, AHORA).color, "ambar");
    assert.equal(calcularSalud({ ...sana, recargasFallidas: 1 }, AHORA).color, "ambar");
  });
  it("rojo por sin saldo, un mes sin actividad, 3 negativas, 2 suspendidos, 2 recargas fallidas o suspensión; manda la peor señal", () => {
    for (const e of [{ estadoOficina: "sin_saldo" }, { ultimaActividad: hace(31) }, { valoracionesNegativas: 3 }, { agentesSuspendidos: 2 }, { recargasFallidas: 2 }, { estadoEmpresa: "suspendida" }, { estadoOficina: "pendiente_borrado" }]) {
      const s = calcularSalud({ ...sana, ...e }, AHORA);
      assert.equal(s.color, "rojo", JSON.stringify(e));
      assert.ok(s.resumen.length > 0);
    }
    const mezcla = calcularSalud({ ...sana, estadoOficina: "saldo_bajo", recargasFallidas: 2 }, AHORA);
    assert.equal(mezcla.color, "rojo");
    assert.match(mezcla.resumen, /Saldo bajo/);
    assert.match(mezcla.resumen, /2 recargas fallidas/);
  });
});

const cliente = (p: Partial<Cliente>): Cliente => ({
  id: crypto.randomUUID(), nombre: "Empresa", sector: null, estado: "activa", suspendidaMotivo: null, creadaEn: hace(100), propietario: null,
  agentesActivos: 0, agentesSuspendidos: 0, consumoMes: 0, saldo: 0, ultimaActividad: null, estadoOficina: "activa", oficinaPausada: false,
  pausadaPorSamgple: false, enImplantacion: false, responsable: null, valoracionesNegativas: 0, valoracionesTotal: 0, recargasFallidas: 0,
  salud: calcularSalud(sana, AHORA), ...p,
});

describe("filtros del listado", () => {
  const ana = "00000000-0000-4000-8000-0000000000aa";
  const lista = [
    cliente({ nombre: "Clínica Dental Sol", sector: "Salud", enImplantacion: true, responsable: { id: ana, nombre: "Ana" } }),
    cliente({ nombre: "Hogar Mediterráneo", sector: "Inmobiliaria", estadoOficina: "saldo_bajo", propietario: { id: "x", nombre: "Marcos", email: "marcos@hogar.example" } }),
    cliente({ nombre: "Talleres Ruiz", salud: calcularSalud({ ...sana, estadoOficina: "sin_saldo" }, AHORA), estadoOficina: "sin_saldo" }),
    cliente({ nombre: "Borrada SL", estado: "borrada" }),
  ];
  it("busca sin distinguir tildes ni mayúsculas, también por propietario", () => {
    assert.deepEqual(filtrarClientes(lista, leerFiltros({ q: "clinica" })).map((c) => c.nombre), ["Clínica Dental Sol"]);
    assert.deepEqual(filtrarClientes(lista, leerFiltros({ q: "MARCOS" })).map((c) => c.nombre), ["Hogar Mediterráneo"]);
  });
  it("filtra por implantación, saldo bajo, riesgo, sector y responsable; las borradas solo si se piden", () => {
    assert.deepEqual(filtrarClientes(lista, leerFiltros({ implantacion: "1" })).map((c) => c.nombre), ["Clínica Dental Sol"]);
    assert.deepEqual(filtrarClientes(lista, leerFiltros({ saldoBajo: "1" })).map((c) => c.nombre), ["Hogar Mediterráneo", "Talleres Ruiz"]);
    assert.deepEqual(filtrarClientes(lista, leerFiltros({ riesgo: "1" })).map((c) => c.nombre), ["Talleres Ruiz"]);
    assert.deepEqual(filtrarClientes(lista, leerFiltros({ sector: "Salud" })).map((c) => c.nombre), ["Clínica Dental Sol"]);
    assert.deepEqual(filtrarClientes(lista, leerFiltros({ responsable: ana })).map((c) => c.nombre), ["Clínica Dental Sol"]);
    assert.equal(filtrarClientes(lista, leerFiltros({ responsable: "ninguno" })).length, 2);
    assert.equal(filtrarClientes(lista, leerFiltros({})).length, 3);
    assert.deepEqual(filtrarClientes(lista, leerFiltros({ estado: "borrada" })).map((c) => c.nombre), ["Borrada SL"]);
  });
  it("ignora valores de filtro que no valen", () => {
    assert.equal(filtrarClientes(lista, leerFiltros({ estado: "inventado", responsable: "no-uuid", riesgo: "si" })).length, 3);
  });
});

describe("permisos por rol de plataforma", () => {
  it("admin_samgple puede todo; borrar solo admin; créditos solo finanzas", () => {
    assert.ok(puedeHacer(["admin_samgple"], "borrar"));
    for (const r of ["comercial_samgple", "implantacion_samgple", "soporte_samgple", "finanzas_samgple"] as const) assert.ok(!puedeHacer([r], "borrar"));
    assert.ok(puedeHacer(["finanzas_samgple"], "creditos"));
    assert.ok(!puedeHacer(["comercial_samgple", "soporte_samgple"], "creditos"));
    assert.ok(puedeHacer(["comercial_samgple"], "anotar"));
    assert.ok(!puedeHacer(["revisor_samgple"], "anotar"));
  });
});
