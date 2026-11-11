/**
 * certificacion · 12 s en bucle. El agente cruza cuatro puertas del examen técnico (funciona, cumple su
 * objetivo, respeta sus límites, resiste ataques) con datos ficticios; cada una se enciende en verde.
 * Después una persona del equipo lo revisa y el agente recibe su sello de certificado.
 */
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Ban, Bot, Lock, Settings, Target, UserCheck } from "lucide-react";
import { entre, pulso } from "../comun/animar";
import { AZUL, Haz, LUZ, Lienzo, Orbe, Rotulo, Sello, VERDE, alfa, pop, useTiempo, type Punto } from "../comun/simbolos";

const PUERTAS: { x: number; Icono: LucideIcon; texto: string }[] = [
  { x: 300, Icono: Settings, texto: "Funciona" },
  { x: 480, Icono: Target, texto: "Objetivo" },
  { x: 660, Icono: Ban, texto: "Límites" },
  { x: 840, Icono: Lock, texto: "Seguridad" },
];
const Y = 380;

export function Certificacion() {
  const { f, s, vida } = useTiempo();
  const v = vida(0.6, 0.9);
  // El agente avanza a saltos: llega a cada puerta 1,4 s después de la anterior.
  const llegada = (i: number) => 1.3 + i * 1.4;
  const xs = [130, ...PUERTAS.map((p) => p.x), 1030];
  const tramos = [0.5, ...PUERTAS.map((_, i) => llegada(i)), 7.0];
  let x = xs[0];
  for (let i = 0; i < xs.length - 1; i++) {
    const avance = entre(f, s(tramos[i] + (i === 0 ? 0 : 0.35)), s(tramos[i + 1]));
    if (avance > 0) x = xs[i] + (xs[i + 1] - xs[i]) * avance;
  }
  const agente: Punto = { x, y: Y };
  const revisor: Punto = { x: 1030, y: 150 };
  const certificado = entre(f, s(9.0), s(9.4));
  return (
    <Lienzo tinte={VERDE} foco={{ x: 55, y: 50 }}>
      {PUERTAS.map((p, i) => {
        const pasa = entre(f, s(llegada(i) - 0.1), s(llegada(i) + 0.3));
        const color = pasa > 0.5 ? VERDE : "#ffffff";
        const aparece = entre(f, s(0.2 + i * 0.12), s(0.8 + i * 0.12)) * v;
        return (
          <div key={p.texto}>
            <div
              style={{
                position: "absolute", left: p.x - 38, top: Y - 115, width: 76, height: 230, borderRadius: 38, opacity: aparece,
                border: `2px solid ${alfa(color, 0.35 + 0.5 * pasa)}`, background: alfa(color, 0.05 + 0.12 * pasa),
                boxShadow: `0 0 ${30 * pulso(f, s(llegada(i) + 0.2), s(0.9))}px ${alfa(VERDE, 0.7)}`,
              }}
            />
            <Orbe p={{ x: p.x, y: Y - 160 }} r={20} color={pasa > 0.5 ? VERDE : "#64748B"} Icono={p.Icono} visible={aparece} />
            <Sello p={pop(f, s(llegada(i) + 0.15), s(llegada(i) + 0.6)) * v} centro={{ x: p.x, y: Y + 138 }} r={13} />
            <Rotulo p={{ x: p.x, y: Y + 162 }} texto={p.texto} visible={aparece} activo={pasa} />
          </div>
        );
      })}
      <Haz id="ce-rev" desde={revisor} hasta={{ x: 1030, y: Y - 40 }} t={entre(f, s(7.6), s(8.6))} visible={entre(f, s(7.3), s(7.6)) * v} color1={LUZ} color2={VERDE} curva={0.25} />
      <Orbe p={revisor} r={32} color={LUZ} Icono={UserCheck} visible={entre(f, s(7.0), s(7.5)) * v} brillo={pulso(f, s(8.7), s(1))} />
      <Rotulo p={{ x: revisor.x, y: revisor.y + 46 }} texto="Revisión humana" visible={entre(f, s(7.2), s(7.7)) * v} />
      <Orbe p={agente} r={36} color={certificado > 0.5 ? VERDE : AZUL} Icono={certificado > 0.5 ? BadgeCheck : Bot} visible={entre(f, s(0.1), s(0.6)) * v}
        brillo={0.4 + 0.6 * certificado} onda={entre(f, s(9.0), s(9.9)) * (f < s(9.9) ? 1 : 0)} escala={1 + 0.25 * certificado} />
      <Rotulo p={{ x: 1030, y: Y + 62 }} texto="Certificado" visible={entre(f, s(9.3), s(9.8)) * v} activo={1} />
    </Lienzo>
  );
}
