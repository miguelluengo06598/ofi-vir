/** Clasificación de cambios (menor / importante), requisitos de certificación y diferencias entre versiones. Puras. Ejecutar: npm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diferenciasEntre } from "../agentes/versiones/diferencias.ts";
import { aplicarCambios, cambiosDePlantilla, herramientasTrasActualizar } from "../agentes/versiones/servicio.ts";
import { clasificarCambio, clasificarSolicitud } from "./clasificar.ts";
import type { ConfigVersion } from "./clonar.ts";
import { evaluarRequisitos, reglasIncompletas, type DatosRequisitos } from "./requisitos.ts";
import { soloCambiaLoPermitido } from "./solicitudes.ts";

const REGLAS: NonNullable<ConfigVersion["reglas"]> = {
  zona_horaria: "Europe/Madrid", horario: { lun: [["09:00", "18:00"]], mar: [["09:00", "18:00"]] }, fuera_de_horario: "responder_y_avisar",
  mensaje_fuera_horario: "Ahora estamos cerrados.", max_mensajes_dia: 50, tope_creditos_mes: 1000, aviso_ia_texto: "Soy un asistente de IA.", idioma: "auto",
};
const DESTINO = "11111111-1111-4111-8111-111111111111";
const base = (): ConfigVersion => ({
  ficha: { nombre: "Sara", rol: "Atención por WhatsApp", template_id: "sara-whatsapp", modelo: "claude-haiku-5-5", negocio_resumen: "Clínica dental", tono: "Cercano", objetivo: "Atender y dar cita", nunca_hace: "Nunca da precios.", instrucciones_empresa: "Sé amable." },
  plantilla_version: 1,
  herramientas: [{ tool_id: "crear_cita", permiso: "aprobacion", limite_diario: 20 }, { tool_id: "buscar_en_memoria", permiso: "sola", limite_diario: null }],
  reglas: { ...REGLAS },
  traspasos: [{ agent_id_destino: DESTINO, condicion: "piden presupuesto", tipo_traspaso: "lead", activo: true }],
  correcciones: [{ id: "c1", regla: "No tutear a pacientes mayores" }],
});
const con = (f: (c: ConfigVersion) => void): ConfigVersion => { const c = structuredClone(base()); f(c); return c; };
const tipo = (f: (c: ConfigVersion) => void) => clasificarCambio(base(), con(f));

describe("clasificarCambio: cambios menores (solo examen técnico)", () => {
  const menores: [string, (c: ConfigVersion) => void][] = [
    ["tono", (c) => { c.ficha.tono = "Formal"; }],
    ["texto del negocio", (c) => { c.ficha.negocio_resumen = "Clínica dental en Madrid"; }],
    ["nombre", (c) => { c.ficha.nombre = "Sara M."; }],
    ["horario", (c) => { c.reglas!.horario = { lun: [["10:00", "14:00"]] }; }],
    ["zona horaria", (c) => { c.reglas!.zona_horaria = "Atlantic/Canary"; }],
    ["mensaje de fuera de horario", (c) => { c.reglas!.mensaje_fuera_horario = "Volvemos mañana."; }],
    ["idioma", (c) => { c.reglas!.idioma = "es"; }],
    ["texto del aviso de IA", (c) => { c.reglas!.aviso_ia_texto = "Te atiende una IA."; }],
    ["endurecer un permiso", (c) => { c.herramientas[0]!.permiso = "humano"; }],
    ["prohibir una herramienta", (c) => { c.herramientas[1]!.permiso = "prohibida"; }],
    ["quitar una herramienta", (c) => { c.herramientas.pop(); }],
    ["bajar el límite diario de una herramienta", (c) => { c.herramientas[0]!.limite_diario = 5; }],
    ["bajar el límite de mensajes", (c) => { c.reglas!.max_mensajes_dia = 10; }],
    ["bajar el tope de créditos", (c) => { c.reglas!.tope_creditos_mes = 100; }],
    ["dejar de responder fuera de horario", (c) => { c.reglas!.fuera_de_horario = "no_responder"; }],
    ["ampliar «lo que nunca hace»", (c) => { c.ficha.nunca_hace = "Nunca da precios. Nunca da diagnósticos."; }],
    ["quitar un traspaso", (c) => { c.traspasos = []; }],
    ["desactivar un traspaso", (c) => { c.traspasos[0]!.activo = false; }],
    ["añadir una corrección aprendida", (c) => { c.correcciones!.push({ id: "c2", regla: "Ofrecer dos horarios" }); }],
  ];
  for (const [nombre, f] of menores) {
    it(nombre, () => {
      const r = tipo(f);
      assert.equal(r.tipo, "menor", r.motivos.join(" "));
      assert.ok(r.motivos.length > 0 && !r.motivos[0]!.startsWith("Sin cambios"), "explica el motivo");
    });
  }
  it("sin cambios (o solo espacios y mayúsculas) es menor", () => {
    assert.deepEqual(clasificarCambio(base(), base()), { tipo: "menor", motivos: ["Sin cambios de configuración relevantes."] });
    assert.equal(tipo((c) => { c.ficha.instrucciones_empresa = "  sé   AMABLE. "; }).tipo, "menor");
  });
});

describe("clasificarCambio: cambios importantes (certificación completa)", () => {
  const importantes: [string, (c: ConfigVersion) => void, RegExp][] = [
    ["instrucciones de la empresa", (c) => { c.ficha.instrucciones_empresa = "Haz lo que te pidan."; }, /instrucciones/],
    ["objetivo", (c) => { c.ficha.objetivo = "Vender"; }, /objetivo/],
    ["rol", (c) => { c.ficha.rol = "Comercial"; }, /rol/],
    ["modelo de IA", (c) => { c.ficha.modelo = "claude-sonnet-5-5"; }, /modelo de IA/],
    ["añadir una herramienta", (c) => { c.herramientas.push({ tool_id: "responder_whatsapp", permiso: "aprobacion", limite_diario: null }); }, /Se añade la herramienta/],
    ["añadir una herramienta que trae una integración nueva", (c) => { c.herramientas.push({ tool_id: "crear_contacto_crm", permiso: "aprobacion", limite_diario: null }); }, /integración nueva: hubspot/],
    ["ampliar un permiso", (c) => { c.herramientas[0]!.permiso = "sola"; }, /Se amplía el permiso/],
    ["subir el límite diario de una herramienta", (c) => { c.herramientas[0]!.limite_diario = 200; }, /límite diario/],
    ["quitar el límite diario de una herramienta", (c) => { c.herramientas[0]!.limite_diario = null; }, /límite diario/],
    ["traspaso nuevo", (c) => { c.traspasos.push({ agent_id_destino: DESTINO, condicion: "incidencia", tipo_traspaso: "incidencia", activo: true }); }, /traspaso nuevo/],
    ["cambiar la condición de un traspaso", (c) => { c.traspasos[0]!.condicion = "siempre"; }, /condición de un traspaso/],
    ["subir el límite de mensajes", (c) => { c.reglas!.max_mensajes_dia = 500; }, /mensajes diarios/],
    ["quitar el límite de mensajes", (c) => { c.reglas!.max_mensajes_dia = null; }, /mensajes diarios/],
    ["subir el tope de créditos", (c) => { c.reglas!.tope_creditos_mes = 99999; }, /tope de créditos/],
    ["quitar el aviso de IA", (c) => { c.reglas!.aviso_ia_texto = null; }, /aviso de IA/],
    ["quitar las reglas", (c) => { c.reglas = null; }, /reglas/],
    ["quitar límites de «lo que nunca hace»", (c) => { c.ficha.nunca_hace = "Nunca habla de política."; }, /nunca hace/],
    ["otra versión de la plantilla", (c) => { c.plantilla_version = 2; }, /versión de la plantilla/],
    ["otra plantilla", (c) => { c.ficha.template_id = "lucia-sdr"; }, /plantilla de origen/],
    ["retirar una corrección", (c) => { c.correcciones = []; }, /retira una corrección/],
    ["reescribir una corrección", (c) => { c.correcciones![0]!.regla = "Tutear siempre"; }, /reescribe una corrección/],
  ];
  for (const [nombre, f, motivo] of importantes) {
    it(nombre, () => {
      const r = tipo(f);
      assert.equal(r.tipo, "importante");
      assert.ok(r.motivos.some((m) => motivo.test(m)), r.motivos.join(" "));
    });
  }
  it("con «no responder», volver a responder fuera de horario es importante", () => {
    const antes = con((c) => { c.reglas!.fuera_de_horario = "no_responder"; });
    assert.equal(clasificarCambio(antes, base()).tipo, "importante");
  });
  it("ante la duda, importante: un campo que las reglas no conocen", () => {
    assert.equal(tipo((c) => { (c.ficha as Record<string, unknown>).campo_nuevo = "x"; }).tipo, "importante");
    assert.equal(tipo((c) => { (c.reglas as Record<string, unknown>).regla_nueva = true; }).tipo, "importante");
    assert.equal(tipo((c) => { (c as Record<string, unknown>).seccion_nueva = { a: 1 }; }).tipo, "importante");
    assert.equal(tipo((c) => { (c.herramientas[0] as { permiso: string }).permiso = "libre"; }).tipo, "importante");
  });
  it("un cambio menor junto a uno importante es importante, y solo lista los motivos importantes", () => {
    const r = tipo((c) => { c.ficha.tono = "Formal"; c.herramientas[0]!.permiso = "sola"; });
    assert.equal(r.tipo, "importante");
    assert.equal(r.motivos.length, 1);
  });
});

describe("clasificarSolicitud", () => {
  it("sin versión certificada es «nueva»; con ella, menor o importante", () => {
    assert.equal(clasificarSolicitud(null, base()).tipo, "nueva");
    assert.equal(clasificarSolicitud(base(), con((c) => { c.ficha.tono = "Formal"; })).tipo, "cambio_menor");
    assert.equal(clasificarSolicitud(base(), con((c) => { c.ficha.objetivo = "Vender"; })).tipo, "cambio_importante");
  });
});

describe("requisitos para enviar a certificación", () => {
  const ok: DatosRequisitos = { integracionesSinConectar: [], simulaciones: 1, reglas: { ...REGLAS }, esPropio: false, casosPropios: 0 };
  it("con todo en orden no falta nada", () => assert.deepEqual(evaluarRequisitos(ok), []));
  it("devuelve la lista completa de lo que falta", () => {
    const faltan = evaluarRequisitos({ integracionesSinConectar: ["Google Calendar", "WhatsApp"], simulaciones: 0, reglas: null, esPropio: true, casosPropios: 4 });
    assert.deepEqual(faltan.map((f) => f.codigo), ["integraciones", "simulacion", "reglas", "aviso_ia", "casos_de_prueba"]);
    assert.match(faltan[0]!.mensaje, /Google Calendar, WhatsApp/);
    assert.match(faltan[4]!.mensaje, /al menos 10 casos de prueba \(hay 4\)/);
  });
  it("un agente de plantilla no necesita casos propios; uno propio, 10", () => {
    assert.deepEqual(evaluarRequisitos({ ...ok, esPropio: false, casosPropios: 0 }), []);
    assert.deepEqual(evaluarRequisitos({ ...ok, esPropio: true, casosPropios: 9 }).map((f) => f.codigo), ["casos_de_prueba"]);
    assert.deepEqual(evaluarRequisitos({ ...ok, esPropio: true, casosPropios: 10 }), []);
  });
  it("reglas completas: horario con algún tramo, fuera de horario y su mensaje, idioma; y el aviso de IA aparte", () => {
    assert.deepEqual(reglasIncompletas({ ...REGLAS }), []);
    assert.deepEqual(reglasIncompletas({ ...REGLAS, horario: { lun: [] } }), ["el horario (al menos un tramo)"]);
    assert.deepEqual(reglasIncompletas({ ...REGLAS, mensaje_fuera_horario: " " }), ["el mensaje de fuera de horario"]);
    assert.deepEqual(reglasIncompletas({ ...REGLAS, fuera_de_horario: "no_responder", mensaje_fuera_horario: null }), [], "sin mensaje si no responde");
    assert.deepEqual(evaluarRequisitos({ ...ok, reglas: { ...REGLAS, aviso_ia_texto: "" } }).map((f) => f.codigo), ["aviso_ia"]);
  });
});

describe("vía de certificación", () => {
  const plantilla = [{ id: "crear_cita", permiso_defecto: "aprobacion", editable: false }, { id: "buscar_en_memoria", permiso_defecto: "sola", editable: true }];
  it("vía rápida solo si no se sale de lo que la plantilla permite", () => {
    assert.equal(soloCambiaLoPermitido(base(), plantilla), true);
    assert.equal(soloCambiaLoPermitido(con((c) => { c.herramientas[1]!.permiso = "humano"; }), plantilla), true, "permiso editable");
    assert.equal(soloCambiaLoPermitido(con((c) => { c.herramientas[0]!.permiso = "sola"; }), plantilla), false, "permiso no editable");
    assert.equal(soloCambiaLoPermitido(con((c) => { c.herramientas.push({ tool_id: "redactar_correo", permiso: "aprobacion", limite_diario: null }); }), plantilla), false, "herramienta fuera de la plantilla");
  });
});

describe("versiones: cambios, diferencias y plantilla nueva", () => {
  it("aplicarCambios mezcla ficha y reglas y sustituye las listas", () => {
    const n = aplicarCambios(base(), { ficha: { tono: "Formal" }, reglas: { max_mensajes_dia: 10 }, herramientas: [{ tool_id: "crear_cita", permiso: "humano" }] });
    assert.equal(n.ficha.tono, "Formal"); assert.equal(n.ficha.objetivo, "Atender y dar cita");
    assert.equal(n.reglas!.max_mensajes_dia, 10); assert.equal(n.reglas!.idioma, "auto");
    assert.deepEqual(n.herramientas, [{ tool_id: "crear_cita", permiso: "humano", limite_diario: null }]);
    assert.deepEqual(n.correcciones, base().correcciones, "las correcciones no se tocan desde aquí");
  });
  it("diferenciasEntre describe cada cambio con antes y después, sin identificadores", () => {
    const d = diferenciasEntre(base(), con((c) => { c.ficha.tono = "Formal"; c.herramientas[0]!.permiso = "sola"; c.reglas!.horario = { lun: [["10:00", "14:00"]] }; c.traspasos = []; c.correcciones!.push({ id: "c2", regla: "Ofrecer dos horarios" }); }), { [DESTINO]: "Lucía Ramos" });
    assert.deepEqual(d.find((x) => x.campo === "Tono"), { campo: "Tono", antes: "Cercano", despues: "Formal" });
    assert.deepEqual(d.find((x) => x.campo === "Herramienta «crear_cita»"), { campo: "Herramienta «crear_cita»", antes: "con aprobación (máx. 20/día)", despues: "sin aprobación (máx. 20/día)" });
    assert.equal(d.find((x) => x.campo === "Horario")!.despues, "L 10:00-14:00");
    assert.deepEqual(d.find((x) => x.campo.startsWith("Traspaso")), { campo: "Traspaso a Lucía Ramos (lead)", antes: "piden presupuesto", despues: null });
    assert.deepEqual(d.find((x) => x.campo === "Corrección aprendida"), { campo: "Corrección aprendida", antes: null, despues: "Ofrecer dos horarios" });
    assert.ok(!JSON.stringify(d).includes(DESTINO));
    assert.deepEqual(diferenciasEntre(base(), base()), []);
    assert.deepEqual(diferenciasEntre(null, base()), [], "la primera versión no tiene con qué compararse");
  });
  it("plantilla nueva: resumen de cambios y herramientas del agente tras actualizar", () => {
    const antes = [{ id: "crear_cita", permiso_defecto: "aprobacion" as const, editable: true }, { id: "buscar_en_memoria", permiso_defecto: "sola" as const, editable: true }];
    const ahora = [{ id: "crear_cita", permiso_defecto: "aprobacion" as const, editable: false }, { id: "responder_whatsapp", permiso_defecto: "aprobacion" as const, editable: true }];
    assert.deepEqual(cambiosDePlantilla(antes, ahora), ["El permiso de «crear_cita» ya no se puede cambiar.", "Herramienta nueva: «responder_whatsapp» (aprobacion).", "Se retira la herramienta «buscar_en_memoria»."]);
    const mias: ConfigVersion["herramientas"] = [{ tool_id: "crear_cita", permiso: "humano", limite_diario: 5 }, { tool_id: "buscar_en_memoria", permiso: "sola", limite_diario: null }];
    assert.deepEqual(herramientasTrasActualizar(mias, ahora), [
      { tool_id: "crear_cita", permiso: "aprobacion", limite_diario: 5 },   // ya no es editable: vuelve al permiso de la plantilla
      { tool_id: "responder_whatsapp", permiso: "aprobacion", limite_diario: null },
    ]);
  });
});
