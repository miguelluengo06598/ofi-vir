import { z } from "zod";
import { integracionNoConectada } from "./integraciones.ts";
import { definir } from "./tipos.ts";

export const HERRAMIENTAS_ANUNCIOS = [
  definir({
    id: "leer_campanas_meta",
    nombre: "Leer campañas de Meta Ads",
    descripcionClaude: "Lee el rendimiento de las campañas de Meta Ads (gasto, clics, leads). Solo lectura: no cambia nada.",
    descripcionEmpresa: "Consulta cómo van vuestras campañas de Facebook e Instagram. Solo lee: no gasta ni cambia nada.",
    entrada: z.object({ periodo: z.enum(["ultimos_7_dias", "ultimos_30_dias"]).default("ultimos_7_dias"), max: z.number().int().min(1).max(25).default(10) }),
    salida: z.object({ campanas: z.array(z.object({ nombre: z.string(), gasto_centimos: z.number().int().min(0), clics: z.number().int().min(0), leads: z.number().int().min(0) })).max(25) }),
    categoria: "anuncios", sensibilidad: "lectura", integracion: "meta_ads", costeCreditos: null, datosExternos: true,
    ejecutar: async () => integracionNoConectada("Meta Ads"),
    simular: () => ({
      campanas: [
        { nombre: "Implantes · captación otoño", gasto_centimos: 18450, clics: 412, leads: 23 },
        { nombre: "Revisión gratuita", gasto_centimos: 9210, clics: 301, leads: 11 },
      ],
    }),
  }),
];
