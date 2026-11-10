import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertirRubrica, UMBRAL_REVISION_MUESTRA } from "./servicio.ts";

describe("rúbrica de muestreo", () => {
  it("calcula la media de la misma rúbrica y separa una muestra por debajo de 7", () => {
    const r = convertirRubrica({ objetivo: 8, tono: 7, sin_inventar: 6, limites: 6, motivo: "Inventó un plazo." })!;
    assert.equal(r.score, 6.8);
    assert.ok(r.score < UMBRAL_REVISION_MUESTRA);
  });
  it("rechaza una respuesta de Haiku que no tenga el motivo estructurado", () => {
    assert.equal(convertirRubrica({ objetivo: 10 }), null);
  });
});
