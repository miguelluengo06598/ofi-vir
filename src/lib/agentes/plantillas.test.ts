import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLANTILLAS, obtenerPlantilla } from "./plantillas/index.ts";
import { MIN_CASOS_DE_PRUEBA, contenidoParaBase, huellaDe, validarPlantilla } from "./plantillas/sincronizar.ts";
import type { PlantillaAgente } from "./plantillas/tipos.ts";

const permiso = (p: PlantillaAgente, id: string) => p.herramientas.find((h) => h.id === id);
const copia = (p: PlantillaAgente, cambios: Partial<PlantillaAgente>): PlantillaAgente => ({ ...structuredClone(p), ...cambios });

describe("plantillas de IDESIE", () => {
  it("están las diez plantillas, sin repetir", () => {
    assert.deepEqual(PLANTILLAS.map((p) => p.id), [
      "lucia-sdr", "sara-whatsapp", "ivan-crm", "marco-cierre", "paula-reactivacion", "leo-email", "nora-contenido", "teo-anuncios", "ada-analista", "atlas-coordinador",
    ]);
  });

  for (const p of PLANTILLAS) {
    it(`${p.id}: es coherente con el catálogo de herramientas`, () => {
      assert.deepEqual(validarPlantilla(p), []);
    });
    it(`${p.id}: tiene al menos ${MIN_CASOS_DE_PRUEBA} casos de prueba con entrada y comportamiento esperado`, () => {
      assert.ok(p.casosDePrueba.length >= MIN_CASOS_DE_PRUEBA);
      for (const c of p.casosDePrueba) assert.ok(c.entrada.length > 10 && c.esperado.length > 10, c.id);
    });
    it(`${p.id}: todos sus casos de intento de manipulación o de escalado tienen una expectativa comprobable`, () => {
      const sensibles = p.casosDePrueba.filter((c) => /inyeccion|orden-en-correo|queja|rgpd/.test(c.id));
      assert.ok(sensibles.length >= 1);
      for (const c of sensibles) assert.ok((c.debeUsar?.length ?? 0) + (c.noDebeUsar?.length ?? 0) > 0, c.id);
    });
  }

  it("lucia-sdr: correo, WhatsApp y cita con aprobación; CRM y agenda sola; tipo de tarea estándar", () => {
    const p = obtenerPlantilla("lucia-sdr")!;
    for (const id of ["redactar_correo", "responder_whatsapp", "crear_cita"]) assert.equal(permiso(p, id)?.permisoDefecto, "aprobacion", id);
    for (const id of ["buscar_contacto_crm", "crear_contacto_crm", "actualizar_contacto_crm", "ver_huecos_agenda"]) assert.equal(permiso(p, id)?.permisoDefecto, "sola", id);
    assert.ok(permiso(p, "pasar_a_agente") && permiso(p, "pasar_a_humano"));
    assert.equal(p.tipoTareaPorDefecto, "estandar");
    assert.equal(p.departamentoTipo, "ventas");
  });

  it("sara-whatsapp: WhatsApp sola y editable para las dudas; cita con aprobación; sin correo ni CRM", () => {
    const p = obtenerPlantilla("sara-whatsapp")!;
    assert.deepEqual(permiso(p, "responder_whatsapp"), { id: "responder_whatsapp", permisoDefecto: "sola", editable: true });
    assert.equal(permiso(p, "crear_cita")?.permisoDefecto, "aprobacion");
    assert.equal(permiso(p, "redactar_correo"), undefined);
    assert.equal(p.herramientas.some((h) => h.id.endsWith("_crm")), false);
    assert.equal(p.departamentoTipo, "atencion");
  });

  it("ivan-crm: actualizar sola; borrar y fusionar SIEMPRE con aprobación y sin poder relajarlo; sin herramientas de envío", () => {
    const p = obtenerPlantilla("ivan-crm")!;
    assert.equal(permiso(p, "actualizar_contacto_crm")?.permisoDefecto, "sola");
    for (const id of ["borrar_contacto_crm", "fusionar_contactos_crm"]) assert.deepEqual(permiso(p, id), { id, permisoDefecto: "aprobacion", editable: false });
    assert.ok(permiso(p, "crear_nota_crm"));
    assert.equal(p.herramientas.some((h) => ["redactar_correo", "responder_whatsapp", "crear_cita"].includes(h.id)), false);
    assert.equal(p.departamentoTipo, "operaciones");
  });
});

describe("validación de plantillas", () => {
  const base = obtenerPlantilla("lucia-sdr")!;

  it("rechaza una herramienta que no existe", () => {
    const p = copia(base, { herramientas: [...base.herramientas, { id: "enviar_todo", permisoDefecto: "sola", editable: true }] });
    assert.match(validarPlantilla(p).join("\n"), /enviar_todo.*no existe/);
  });
  it("rechaza integraciones que no coinciden con las herramientas", () => {
    assert.match(validarPlantilla(copia(base, { integracionesRequeridas: ["hubspot"] })).join("\n"), /integraciones declaradas/);
  });
  it("rechaza borrar sin aprobación o con permiso editable", () => {
    const ivan = obtenerPlantilla("ivan-crm")!;
    const sola = copia(ivan, { herramientas: ivan.herramientas.map((h) => (h.id === "borrar_contacto_crm" ? { ...h, permisoDefecto: "sola" } : h)) });
    const editable = copia(ivan, { herramientas: ivan.herramientas.map((h) => (h.id === "fusionar_contactos_crm" ? { ...h, editable: true } : h)) });
    assert.match(validarPlantilla(sola).join("\n"), /borrar_contacto_crm.*aprobación/);
    assert.match(validarPlantilla(editable).join("\n"), /fusionar_contactos_crm.*aprobación/);
  });
  it("rechaza menos de 10 casos de prueba", () => {
    assert.match(validarPlantilla(copia(base, { casosDePrueba: base.casosDePrueba.slice(0, 9) })).join("\n"), /al menos 10 casos/);
  });
  it("rechaza un caso que exige una herramienta que la plantilla no tiene", () => {
    const casos = structuredClone(base.casosDePrueba);
    casos[0].debeUsar = ["borrar_contacto_crm"];
    assert.match(validarPlantilla(copia(base, { casosDePrueba: casos })).join("\n"), /exige «borrar_contacto_crm»/);
  });
  it("rechaza instrucciones que citan una herramienta que la plantilla no incluye", () => {
    assert.match(validarPlantilla(copia(base, { instruccionesBase: `${base.instruccionesBase}\nUsa borrar_contacto_crm.` })).join("\n"), /citan «borrar_contacto_crm»/);
  });
  it("rechaza instrucciones tan largas que se recortarían al montar el prompt", () => {
    assert.match(validarPlantilla(copia(base, { instruccionesBase: "x".repeat(12001) })).join("\n"), /límite/);
  });
});

describe("huella del contenido (decide si se sube la versión)", () => {
  const base = obtenerPlantilla("sara-whatsapp")!;

  it("es estable: la misma plantilla da siempre la misma huella", () => {
    assert.equal(huellaDe(base), huellaDe(structuredClone(base)));
  });
  it("cambia si cambian las instrucciones, las herramientas o los permisos", () => {
    assert.notEqual(huellaDe(base), huellaDe(copia(base, { instruccionesBase: `${base.instruccionesBase} ` + "Nueva regla." })));
    assert.notEqual(huellaDe(base), huellaDe(copia(base, { herramientas: base.herramientas.slice(1) })));
    assert.notEqual(huellaDe(base), huellaDe(copia(base, { herramientas: base.herramientas.map((h) => (h.id === "responder_whatsapp" ? { ...h, permisoDefecto: "aprobacion" } : h)) })));
  });
  it("no cambia por el orden de las herramientas ni por los casos de prueba (no se copian a la base)", () => {
    assert.equal(huellaDe(base), huellaDe(copia(base, { herramientas: [...base.herramientas].reverse() })));
    assert.equal(huellaDe(base), huellaDe(copia(base, { casosDePrueba: base.casosDePrueba.slice(0, 11) })));
  });
  it("lo que se copia a la base incluye las instrucciones base y el formato de herramientas esperado", () => {
    const fila = contenidoParaBase(base);
    assert.ok(fila.instrucciones_base.startsWith("Eres Sara"));
    assert.ok(fila.herramientas_disponibles.every((h) => typeof h.id === "string" && typeof h.permiso_defecto === "string" && typeof h.editable === "boolean"));
    assert.ok(fila.que_hace.startsWith("- "));
  });
});
