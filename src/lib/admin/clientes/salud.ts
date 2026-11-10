/**
 * Indicador de salud de un cliente (verde, ámbar, rojo) con los motivos que lo explican. Función pura: la usan el listado y la
 * ficha, y se prueba sin base de datos. Señales: actividad reciente, saldo, valoraciones negativas, agentes suspendidos y
 * recargas fallidas. Una empresa suspendida o borrada siempre es roja.
 */
import { UMBRALES_SALUD } from "./config.ts";

export type Color = "verde" | "ambar" | "rojo";
export type EntradaSalud = {
  estadoEmpresa: string;
  estadoOficina: string | null;
  ultimaActividad: string | null;
  saldo: number;
  valoracionesNegativas: number;
  valoracionesTotal: number;
  agentesSuspendidos: number;
  recargasFallidas: number;
};
export type Senal = { color: Color; texto: string };
export type Salud = { color: Color; senales: Senal[]; resumen: string };

const ORDEN: Record<Color, number> = { verde: 0, ambar: 1, rojo: 2 };
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function calcularSalud(e: EntradaSalud, ahora: Date, u = UMBRALES_SALUD): Salud {
  const senales: Senal[] = [];
  const nivel = (n: number, ambar: number, rojo: number): Color => (n >= rojo ? "rojo" : n >= ambar ? "ambar" : "verde");

  if (e.estadoEmpresa === "suspendida") senales.push({ color: "rojo", texto: "Empresa suspendida" });
  if (e.estadoEmpresa === "borrada") senales.push({ color: "rojo", texto: "Empresa borrada" });

  // Actividad reciente.
  if (!e.ultimaActividad) {
    senales.push({ color: "ambar", texto: "Todavía sin actividad" });
  } else {
    const dias = Math.floor((ahora.getTime() - new Date(e.ultimaActividad).getTime()) / 86_400_000);
    const c = nivel(dias, u.diasSinActividadAmbar + 1, u.diasSinActividadRojo + 1);
    senales.push({ color: c, texto: c === "verde" ? (dias <= 0 ? "Activa hoy" : `Última actividad hace ${plural(dias, "día", "días")}`) : `Sin actividad desde hace ${plural(dias, "día", "días")}` });
  }

  // Saldo.
  if (e.estadoOficina === "sin_saldo") senales.push({ color: "rojo", texto: "Sin saldo" });
  else if (e.estadoOficina === "saldo_bajo") senales.push({ color: "ambar", texto: `Saldo bajo (${e.saldo.toLocaleString("es-ES")} créditos)` });
  else senales.push({ color: "verde", texto: `Saldo correcto (${e.saldo.toLocaleString("es-ES")} créditos)` });
  if (e.estadoOficina === "pausada") senales.push({ color: "rojo", texto: "Oficina pausada por inactividad" });
  if (e.estadoOficina === "pendiente_borrado") senales.push({ color: "rojo", texto: "Oficina pendiente de borrado" });

  // Valoraciones negativas (30 días).
  const neg = nivel(e.valoracionesNegativas, u.negativasAmbar, u.negativasRojo);
  senales.push({ color: neg, texto: e.valoracionesNegativas === 0 ? "Sin valoraciones negativas en 30 días" : `${plural(e.valoracionesNegativas, "valoración negativa", "valoraciones negativas")} de ${e.valoracionesTotal} en 30 días` });

  // Agentes suspendidos.
  if (e.agentesSuspendidos > 0) senales.push({ color: nivel(e.agentesSuspendidos, u.agentesSuspendidosAmbar, u.agentesSuspendidosRojo), texto: `${plural(e.agentesSuspendidos, "agente suspendido", "agentes suspendidos")}` });

  // Recargas automáticas fallidas (30 días).
  if (e.recargasFallidas > 0) senales.push({ color: nivel(e.recargasFallidas, u.recargasFallidasAmbar, u.recargasFallidasRojo), texto: `${plural(e.recargasFallidas, "recarga fallida", "recargas fallidas")} en 30 días` });

  const color = senales.reduce<Color>((peor, s) => (ORDEN[s.color] > ORDEN[peor] ? s.color : peor), "verde");
  const malas = senales.filter((s) => s.color !== "verde");
  const resumen = color === "verde" ? "Todo en orden: " + senales.map((s) => s.texto.toLowerCase()).join(", ") + "." : malas.map((s) => s.texto).join(" · ");
  return { color, senales, resumen };
}

export const NOMBRE_COLOR: Record<Color, string> = { verde: "Bien", ambar: "Atención", rojo: "En riesgo" };
