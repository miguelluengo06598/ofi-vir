import { z } from "zod";
import { HERRAMIENTAS } from "../../agents/tools.ts";
import { definir } from "./tipos.ts";

/** Las tres herramientas de memoria ya existen en el motor (src/lib/agents/tools.ts): se reutilizan tal cual, sin copiar su lógica. */
const delMotor = (nombre: string) => {
  const t = HERRAMIENTAS.find((h) => h.name === nombre);
  if (!t) throw new Error(`Herramienta del motor no encontrada: ${nombre}`);
  return t;
};
const salidaTexto = z.string().max(20000);

const buscar = delMotor("buscar_en_memoria");
const historial = delMotor("ver_historial_del_contacto");
const guardar = delMotor("guardar_recuerdo");

export const HERRAMIENTAS_MEMORIA = [
  definir({
    id: "buscar_en_memoria",
    nombre: "Buscar en la memoria",
    descripcionClaude: buscar.description,
    descripcionEmpresa: "Consulta lo que la oficina ya sabe (contactos, correos, acuerdos, campañas) antes de actuar.",
    entrada: buscar.schema as z.ZodType<z.output<typeof buscar.schema>>,
    salida: salidaTexto,
    categoria: "memoria",
    sensibilidad: "lectura",
    integracion: null,
    costeCreditos: null,
    ejecutar: (ctx, entrada) => buscar.run(ctx, entrada as never),
    // Solo LEE: así el simulador prueba el conocimiento y la memoria reales del agente sin escribir nada.
    simular: (ctx, entrada) => buscar.run(ctx, entrada as never),
  }),
  definir({
    id: "ver_historial_del_contacto",
    nombre: "Ver el historial de un contacto",
    descripcionClaude: historial.description,
    descripcionEmpresa: "Repasa en orden todo lo que consta de un contacto: notas y correos enviados y recibidos.",
    entrada: historial.schema as z.ZodType<z.output<typeof historial.schema>>,
    salida: salidaTexto,
    categoria: "memoria",
    sensibilidad: "lectura",
    integracion: null,
    costeCreditos: null,
    ejecutar: (ctx, entrada) => historial.run(ctx, entrada as never),
    simular: () => "[Simulación] Historial ficticio: 1) Laura escribió pidiendo una demo. 2) Se le respondió con tres huecos. 3) Laura contestó que prefiere el jueves.",
  }),
  definir({
    id: "guardar_recuerdo",
    nombre: "Guardar en la memoria",
    descripcionClaude: guardar.description,
    descripcionEmpresa: "Anota en la memoria de la oficina lo importante y nuevo: quién es el contacto, qué necesita y los próximos pasos.",
    entrada: guardar.schema as z.ZodType<z.output<typeof guardar.schema>>,
    salida: salidaTexto,
    categoria: "memoria",
    sensibilidad: "escritura",
    integracion: null,
    costeCreditos: null,
    ejecutar: (ctx, entrada) => guardar.run(ctx, entrada as never),
    simular: (_ctx, entrada) => `[Simulación] Se habrían guardado ${(entrada as { nodos: unknown[] }).nodos.length} nodo(s) en la memoria. No se ha guardado nada real.`,
  }),
];
