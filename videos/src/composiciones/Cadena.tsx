/**
 * cadena-anuncio-a-venta · 20 s en bucle. Sincronizado con los pasos de la portada (marcas en
 * src/config/videos.ts: 0 · 3 · 6,5 · 9,5 · 12,5 · 16 s):
 *  1 anuncio → 2 Lucía responde → 3 se pide tu aprobación → 4 la apruebas → 5 Iván lo registra → 6 Marketing aprende.
 * Representativo: cinco orbes en un arco y una luz que recorre la cadena.
 */
import { Database, Megaphone, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { departmentColor } from "@/components/glass/tokens";
import { entre, pulso, ventana } from "../comun/animar";
import { AMBAR, Burbuja, Haz, LUZ, Lienzo, Orbe, Rotulo, Sello, VERDE, pop, useTiempo, type Punto } from "../comun/simbolos";

export const MARCAS_CADENA = [0, 3, 6.5, 9.5, 12.5, 16];

const N: Record<"anuncio" | "lucia" | "aprobacion" | "ivan" | "marketing", Punto> = {
  anuncio: { x: 170, y: 440 },
  lucia: { x: 420, y: 250 },
  aprobacion: { x: 650, y: 440 },
  ivan: { x: 880, y: 250 },
  marketing: { x: 1110, y: 440 },
};

export function Cadena() {
  const { f, s, vida } = useTiempo();
  const v = vida(0.6, 1.0);
  const [, m2, m3, m4, m5, m6] = MARCAS_CADENA;
  const activo = (desde: number, hasta: number) => ventana(f, s(desde), s(desde + 0.4), s(hasta), s(hasta + 0.6));

  const aprobado = entre(f, s(m4), s(m4 + 0.5));
  const colorAprob = aprobado > 0.5 ? VERDE : AMBAR;

  const tramo = (id: string, a: Punto, b: Punto, inicio: number, c1: string, c2: string, curva = 0.18) => (
    <Haz id={id} desde={a} hasta={b} t={entre(f, s(inicio), s(inicio + 1.1))} visible={entre(f, s(inicio - 0.3), s(inicio)) * v} color1={c1} color2={c2} curva={curva} />
  );

  return (
    <Lienzo tinte={LUZ} foco={{ x: 50, y: 50 }}>
      {tramo("c1", N.anuncio, N.lucia, m2 - 1.2, departmentColor.marketing, departmentColor.ventas)}
      {tramo("c2", N.lucia, N.aprobacion, m3 - 1.0, departmentColor.ventas, AMBAR)}
      {tramo("c3", N.aprobacion, N.ivan, m5 - 1.2, VERDE, departmentColor.operaciones)}
      {tramo("c4", N.ivan, N.marketing, m6 - 1.2, departmentColor.operaciones, departmentColor.marketing)}
      {/* Lo aprendido vuelve al anuncio: la cadena se cierra. */}
      <Haz id="c5" desde={N.marketing} hasta={N.anuncio} t={entre(f, s(m6 + 1.2), s(m6 + 2.8))} visible={entre(f, s(m6 + 0.9), s(m6 + 1.2)) * v * 0.7} color1={departmentColor.marketing} color2={departmentColor.marketing} curva={-0.16} />

      <Orbe p={N.anuncio} r={40} color={departmentColor.marketing} Icono={Megaphone} visible={entre(f, s(0.1), s(0.7)) * v}
        brillo={activo(0, m2) + pulso(f, s(m6 + 2.9), s(1))} onda={entre(f, s(0.4), s(1.4)) * (f < s(1.4) ? 1 : 0)} />
      <Orbe p={N.lucia} r={40} color={departmentColor.ventas} Icono={MessageCircle} visible={entre(f, s(m2 - 0.6), s(m2)) * v} brillo={activo(m2, m3)} />
      <Orbe p={N.aprobacion} r={40} color={colorAprob} Icono={ShieldCheck} visible={entre(f, s(m3 - 0.4), s(m3)) * v}
        brillo={activo(m3, m5)} onda={entre(f, s(m4), s(m4 + 0.8)) * (f < s(m4 + 0.8) ? 1 : 0)} />
      <Orbe p={N.ivan} r={40} color={departmentColor.operaciones} Icono={Database} visible={entre(f, s(m5 - 0.4), s(m5)) * v} brillo={activo(m5, m6)} />
      <Orbe p={N.marketing} r={40} color={departmentColor.marketing} Icono={Sparkles} visible={entre(f, s(m6 - 0.4), s(m6)) * v} brillo={activo(m6, 19)} />

      {/* Lucía responde: dos burbujas junto a ella. */}
      <Burbuja lado="fuera" p={{ x: 470, y: 120 }} w={130} visible={ventana(f, s(m2 + 0.2), s(m2 + 0.6), s(m3 + 1), s(m3 + 1.5)) * v} />
      <Burbuja lado="agente" p={{ x: 520, y: 175 }} w={130} color={departmentColor.ventas} visible={ventana(f, s(m2 + 1.0), s(m2 + 1.4), s(m3 + 1), s(m3 + 1.5)) * v} />

      {/* La aprobación: espera (ámbar) y luego el sello verde. */}
      <Sello p={pop(f, s(m4), s(m4 + 0.5)) * v} centro={{ x: N.aprobacion.x + 32, y: N.aprobacion.y - 32 }} />
      <Sello p={pop(f, s(m5 + 0.4), s(m5 + 0.9)) * v} centro={{ x: N.ivan.x + 32, y: N.ivan.y - 32 }} />

      <Rotulo p={{ x: N.anuncio.x, y: N.anuncio.y + 56 }} texto="Anuncio" visible={entre(f, s(0.1), s(0.7)) * v} activo={activo(0, m2)} />
      <Rotulo p={{ x: N.lucia.x, y: N.lucia.y + 56 }} texto="Lucía responde" visible={entre(f, s(m2 - 0.6), s(m2)) * v} activo={activo(m2, m3)} />
      <Rotulo p={{ x: N.aprobacion.x, y: N.aprobacion.y + 56 }} texto={aprobado > 0.5 ? "Aprobado" : "Tu aprobación"} visible={entre(f, s(m3 - 0.4), s(m3)) * v} activo={activo(m3, m5)} />
      <Rotulo p={{ x: N.ivan.x, y: N.ivan.y + 56 }} texto="CRM" visible={entre(f, s(m5 - 0.4), s(m5)) * v} activo={activo(m5, m6)} />
      <Rotulo p={{ x: N.marketing.x, y: N.marketing.y + 56 }} texto="Aprende" visible={entre(f, s(m6 - 0.4), s(m6)) * v} activo={activo(m6, 19)} />
    </Lienzo>
  );
}
