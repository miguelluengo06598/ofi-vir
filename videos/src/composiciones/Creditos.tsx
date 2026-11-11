/**
 * creditos · 8 s en bucle. Un anillo de saldo que se va gastando: de él salen chispas hacia tres tareas
 * de distinto tamaño (simple, estándar, experta) y cada una se marca como hecha. Sin cifras: la idea es
 * «pagas por tarea, y ves en qué se va el saldo».
 */
import { Coins, Mail, Sparkles, Zap } from "lucide-react";
import { entre, pulso } from "../comun/animar";
import { AZUL, Ficha, Haz, LUZ, Lienzo, Orbe, Sello, VERDE, alfa, pop, useTiempo, type Punto } from "../comun/simbolos";

const TAREAS = [
  { Icono: Zap, y: 150, gasto: 0.03, t: 1.0, color: AZUL },
  { Icono: Mail, y: 300, gasto: 0.07, t: 2.6, color: VERDE },
  { Icono: Sparkles, y: 450, gasto: 0.16, t: 4.2, color: LUZ },
];

export function Creditos() {
  const { f, s, vida } = useTiempo();
  const v = vida(0.6, 0.8);
  const centro: Punto = { x: 380, y: 360 };
  const R = 150;
  const inicial = 0.82;
  const gastado = TAREAS.reduce((acc, t) => acc + t.gasto * entre(f, s(t.t + 0.9), s(t.t + 1.3)), 0);
  const nivel = (inicial - gastado) * entre(f, s(0.1), s(0.9));
  const C = 2 * Math.PI * R;
  return (
    <Lienzo tinte={LUZ} foco={{ x: 30, y: 50 }}>
      <svg style={{ position: "absolute", inset: 0, opacity: v }} width="100%" height="100%">
        <circle cx={centro.x} cy={centro.y} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="16" />
        <circle
          cx={centro.x} cy={centro.y} r={R} fill="none" stroke={LUZ} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${C * nivel} ${C}`} transform={`rotate(-90 ${centro.x} ${centro.y})`}
          style={{ filter: `drop-shadow(0 0 10px ${alfa(LUZ, 0.6)})` }}
        />
      </svg>
      <Orbe p={centro} r={58} color="#E0A846" Icono={Coins} visible={entre(f, s(0.1), s(0.8)) * v}
        brillo={Math.max(...TAREAS.map((t) => pulso(f, s(t.t + 0.1), s(0.6))))} />
      {TAREAS.map((t, i) => {
        const llega: Punto = { x: 770, y: t.y + 32 };
        return (
          <div key={i}>
            <Haz id={`cr-${i}`} desde={{ x: centro.x + R, y: centro.y }} hasta={llega} t={entre(f, s(t.t), s(t.t + 0.9))}
              visible={entre(f, s(t.t - 0.3), s(t.t)) * (1 - entre(f, s(6.6), s(7.4))) * v * 0.8} color1={LUZ} color2={t.color} curva={0.08} />
            <Ficha x={780} y={t.y} w={300 + i * 60} lineas={1} visible={entre(f, s(0.4 + i * 0.2), s(1.0 + i * 0.2)) * v} Icono={t.Icono} color={t.color}
              resalte={{ linea: 0, p: pulso(f, s(t.t + 1.0), s(0.9)) }} />
            <Sello p={pop(f, s(t.t + 1.0), s(t.t + 1.5)) * v} centro={{ x: 780 + 300 + i * 60 - 4, y: t.y + 4 }} />
          </div>
        );
      })}
    </Lienzo>
  );
}
