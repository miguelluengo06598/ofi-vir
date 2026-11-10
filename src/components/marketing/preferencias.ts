"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

type Conexion = EventTarget & { saveData?: boolean; effectiveType?: string };
const conexion = (): Conexion | undefined =>
  typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: Conexion }).connection;

/** Ahorro de datos activado o conexión 2G: solo pósteres, nada de vídeo automático. */
function leerAhorro(): boolean {
  const c = conexion();
  return Boolean(c?.saveData) || c?.effectiveType === "slow-2g" || c?.effectiveType === "2g";
}

function suscribirAhorro(cambio: () => void) {
  const c = conexion();
  c?.addEventListener?.("change", cambio);
  return () => c?.removeEventListener?.("change", cambio);
}

/** true si el visitante pide ahorrar datos o tiene una conexión lenta. En el servidor, false. */
export function useAhorroDeDatos(): boolean {
  return useSyncExternalStore(suscribirAhorro, leerAhorro, () => false);
}

const MQ = "(prefers-reduced-motion: reduce)";
function suscribirMovimiento(cambio: () => void) {
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", cambio);
  return () => mq.removeEventListener("change", cambio);
}

/**
 * prefers-reduced-motion sin desajustes de hidratación: en el servidor y al hidratar vale false, y justo
 * después toma el valor real (useSyncExternalStore vuelve a pintar sin avisos).
 */
export function useMovimientoReducido(): boolean {
  return useSyncExternalStore(suscribirMovimiento, () => window.matchMedia(MQ).matches, () => false);
}

/**
 * Preferencias que deciden cuánta animación y cuántos datos usa la web.
 * - reducido: prefers-reduced-motion → sin paralaje, sin animaciones ligadas al scroll, pasos como lista.
 * - ahorro: saveData o 2G → vídeos sustituidos por su póster.
 */
export function usePreferencias() {
  const forzadas = useContext(PreferenciasForzadas);
  const reducido = useMovimientoReducido();
  const ahorro = useAhorroDeDatos();
  return { reducido: forzadas.reducido ?? reducido, ahorro: forzadas.ahorro ?? ahorro };
}

/** Solo para el laboratorio: fuerza las preferencias para revisar cada variante sin tocar el sistema. */
export const PreferenciasForzadas = createContext<{ reducido?: boolean; ahorro?: boolean }>({});
