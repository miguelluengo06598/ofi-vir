/** Panel de certificación: piezas puras (plazos en horas laborables, segunda opinión, lista de comprobación). Ejecutar: npm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHECKLIST, esperaDe, horasLaborables, leerPlazos, PLAZOS_POR_DEFECTO, type PuntoRevisado } from "./certificacion/config.ts";
import { motivosSegundaOpinion } from "./certificacion/sensibilidad.ts";
import { validarChecklist } from "./certificacion/servicio.ts";

const t = (permiso: string, ...ids: string[]) => ids.map((tool_id) => ({ tool_id, permiso: permiso as "sola", limite_diario: null }));

describe("plazo objetivo en horas laborables", () => {
  // 2026-11-09 es lunes; 13 es viernes; 14 y 15, fin de semana (hora de Madrid = UTC+1 en noviembre).
  const d = (s: string) => new Date(`${s}+01:00`);
  it("entre semana cuenta todas las horas; el fin de semana no corre", () => {
    assert.equal(horasLaborables(d("2026-11-09T10:00:00"), d("2026-11-10T10:00:00")), 24);
    assert.equal(horasLaborables(d("2026-11-13T18:00:00"), d("2026-11-16T10:00:00")), 16, "viernes 18:00 → lunes 10:00 = 6 h del viernes + 10 h del lunes");
    assert.equal(horasLaborables(d("2026-11-14T09:00:00"), d("2026-11-15T21:00:00")), 0, "todo en fin de semana");
    assert.equal(horasLaborables(d("2026-11-09T10:00:00"), d("2026-11-23T10:00:00")), 240, "dos semanas = 10 días laborables");
    assert.equal(horasLaborables(d("2026-11-10T10:00:00"), d("2026-11-09T10:00:00")), 0);
  });
  it("48 h la vía completa y 24 h la rápida por defecto; fuera de plazo solo al superarlo", () => {
    assert.deepEqual(PLAZOS_POR_DEFECTO, { completa: 48, rapida_plantilla: 24 });
    const lunes = d("2026-11-09T10:00:00");
    assert.equal(esperaDe(lunes, "rapida_plantilla", d("2026-11-10T09:00:00")).fueraDePlazo, false);
    assert.equal(esperaDe(lunes, "rapida_plantilla", d("2026-11-10T12:00:00")).fueraDePlazo, true);
    assert.equal(esperaDe(lunes, "completa", d("2026-11-10T12:00:00")).fueraDePlazo, false);
    const tarde = esperaDe(lunes, "completa", d("2026-11-11T12:00:00"));
    assert.equal(tarde.fueraDePlazo, true); assert.equal(tarde.plazo, 48); assert.equal(tarde.texto, "2 d 2 h laborables");
    // Enviada un viernes por la tarde: el lunes por la mañana aún está en plazo.
    assert.equal(esperaDe(d("2026-11-13T17:00:00"), "rapida_plantilla", d("2026-11-16T09:00:00")).fueraDePlazo, false);
  });
  it("los plazos se configuran por entorno; un valor inválido deja el de por defecto", () => {
    assert.deepEqual(leerPlazos({ REVISION_PLAZO_COMPLETA_HORAS: "72", REVISION_PLAZO_RAPIDA_HORAS: "8" }), { completa: 72, rapida_plantilla: 8 });
    assert.deepEqual(leerPlazos({ REVISION_PLAZO_COMPLETA_HORAS: "-3", REVISION_PLAZO_RAPIDA_HORAS: "pronto" }), PLAZOS_POR_DEFECTO);
  });
});

describe("segunda opinión obligatoria (la decide el código)", () => {
  it("no hace falta si solo lee, guarda recuerdos o todo lo sensible pide aprobación", () => {
    assert.deepEqual(motivosSegundaOpinion({ herramientas: [...t("sola", "buscar_en_memoria", "guardar_recuerdo", "ver_huecos_agenda"), ...t("aprobacion", "responder_whatsapp", "redactar_correo", "crear_cita")] }), []);
    assert.deepEqual(motivosSegundaOpinion({ herramientas: t("prohibida", "crear_contacto_crm", "responder_whatsapp") }), [], "una herramienta prohibida no cuenta");
  });
  it("escribe en el CRM (aunque sea con aprobación)", () => {
    const m = motivosSegundaOpinion({ herramientas: [...t("aprobacion", "crear_contacto_crm", "borrar_contacto_crm"), ...t("sola", "buscar_contacto_crm")] });
    assert.equal(m.length, 1); assert.match(m[0]!, /Escribe en el CRM \(crear_contacto_crm, borrar_contacto_crm\)/);
  });
  it("envía mensajes externos sin aprobación", () => {
    assert.match(motivosSegundaOpinion({ herramientas: t("sola", "responder_whatsapp") })[0]!, /sin aprobación \(responder_whatsapp\)/);
    assert.match(motivosSegundaOpinion({ herramientas: t("sola", "redactar_correo") })[0]!, /redactar_correo/);
    assert.match(motivosSegundaOpinion({ herramientas: t("sola", "crear_cita") })[0]!, /crear_cita/);
  });
  it("ante la duda, sí: una herramienta que el registro no conoce", () => {
    assert.equal(motivosSegundaOpinion({ herramientas: t("aprobacion", "pagar_factura_inventada") }).length, 1);
  });
});

describe("lista de comprobación", () => {
  const completa = (): PuntoRevisado[] => CHECKLIST.map((p) => ({ id: p.id, ok: true }));
  it("tiene los 9 puntos pedidos", () => {
    assert.deepEqual(CHECKLIST.map((p) => p.id), ["objetivo", "instrucciones", "permisos", "aprobaciones", "escalado", "aviso_ia", "rgpd", "lssi", "coste"]);
  });
  it("vale completa y ordenada; rechaza la que tiene huecos, repetidos o puntos inventados", () => {
    assert.deepEqual(validarChecklist([...completa()].reverse()), completa(), "la devuelve en el orden de la lista");
    assert.match(validarChecklist(completa().slice(1)) as string, /Falta marcar «Objetivo claro y realista»/);
    assert.match(validarChecklist([...completa().slice(1), { id: "rgpd", ok: true }]) as string, /repetidos/);
    assert.equal(typeof validarChecklist([...completa(), { id: "otro" as never, ok: true }]), "string");
    const conComentario = validarChecklist(completa().map((p) => (p.id === "lssi" ? { ...p, ok: false, comentario: "  Envía publicidad sin baja.  " } : p))) as PuntoRevisado[];
    assert.deepEqual(conComentario.find((p) => p.id === "lssi"), { id: "lssi", ok: false, comentario: "Envía publicidad sin baja." });
  });
});
