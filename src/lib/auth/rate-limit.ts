/**
 * Segundo límite de defensa para formularios de Auth. Supabase mantiene sus propios límites; este
 * protege una instancia de Next contra ráfagas. Para varios procesos, sustituirlo por Redis/KV.
 */
type Registro = { intentos: number; hasta: number };
const cubos = new Map<string, Registro>();

export function permitir(key: string, maximo: number, ventanaMs: number) {
  const ahora = Date.now();
  // Limpieza ocasional: sin ella el mapa crece con cada dirección que pasa por aquí.
  if (cubos.size > 5000) for (const [k, r] of cubos) if (r.hasta <= ahora) cubos.delete(k);
  const actual = cubos.get(key);
  if (!actual || actual.hasta <= ahora) {
    cubos.set(key, { intentos: 1, hasta: ahora + ventanaMs });
    return true;
  }
  if (actual.intentos >= maximo) return false;
  actual.intentos += 1;
  return true;
}

/** Tras un acierto (p. ej. un inicio de sesión correcto) se olvida la cuenta: solo los fallos acercan al bloqueo. */
export function olvidar(key: string) {
  cubos.delete(key);
}
