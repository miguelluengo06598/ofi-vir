/**
 * memoria · 10 s en bucle. Una constelación de recuerdos (hechos, acuerdos, objeciones, pendientes,
 * aprendizajes). Al «pulsar» un contacto, la luz recorre sus conexiones y se encienden los recuerdos
 * relacionados, por cercanía. Luego se apaga y vuelve a respirar.
 */
import { UserRound } from "lucide-react";
import { departmentColor } from "@/components/glass/tokens";
import { entre, ventana } from "../comun/animar";
import { AMBAR, AZUL, LUZ, Lienzo, Orbe, VERDE, alfa, semilla, useTiempo, type Punto } from "../comun/simbolos";

const TIPOS = [AZUL, VERDE, AMBAR, departmentColor.operaciones, LUZ];

type Nodo = Punto & { color: string; r: number; nivel: number };

/** Constelación determinista: nodos repartidos, cada uno unido a sus dos vecinos más cercanos. */
function constelacion() {
  const azar = semilla(42);
  const nodos: Nodo[] = [{ x: 640, y: 360, color: "#ffffff", r: 0, nivel: 0 }];
  let intentos = 0;
  while (nodos.length < 30 && intentos++ < 2000) {
    const p = { x: 120 + azar() * 1040, y: 80 + azar() * 560 };
    if (nodos.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < (n === nodos[0] ? 140 : 95))) continue;
    nodos.push({ ...p, color: TIPOS[Math.floor(azar() * TIPOS.length)], r: 5 + azar() * 4, nivel: -1 });
  }
  const aristas = new Set<string>();
  nodos.forEach((n, i) => {
    const cercanos = nodos
      .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .filter((c) => c.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, i === 0 ? 4 : 2);
    cercanos.forEach((c) => aristas.add(i < c.j ? `${i}-${c.j}` : `${c.j}-${i}`));
  });
  const pares = [...aristas].map((k) => k.split("-").map(Number) as [number, number]);
  // Distancia en saltos desde el contacto (para la propagación de la luz).
  const cola = [0];
  while (cola.length) {
    const i = cola.shift()!;
    pares.forEach(([a, b]) => {
      const otro = a === i ? b : b === i ? a : -1;
      if (otro >= 0 && nodos[otro].nivel < 0) {
        nodos[otro].nivel = nodos[i].nivel + 1;
        cola.push(otro);
      }
    });
  }
  return { nodos, pares };
}

const { nodos: NODOS, pares: PARES } = constelacion();

export function Memoria() {
  const { f, s, vida, ciclo } = useTiempo();
  const v = vida();
  const inicio = 2.0;
  const paso = 0.42;
  const apagado = 1 - entre(f, s(7.4), s(8.6));
  const luz = (nivel: number) => (nivel < 0 || nivel > 3 ? 0 : entre(f, s(inicio + nivel * paso), s(inicio + nivel * paso + 0.4)) * apagado * (1 - nivel * 0.12));
  return (
    <Lienzo tinte={departmentColor.operaciones} foco={{ x: 50, y: 50 }}>
      <svg style={{ position: "absolute", inset: 0 }} width="100%" height="100%">
        {PARES.map(([a, b]) => {
          const na = NODOS[a];
          const nb = NODOS[b];
          const encendida = Math.min(luz(na.nivel), luz(nb.nivel));
          return (
            <line
              key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
              stroke={encendida > 0.01 ? LUZ : "#ffffff"} strokeWidth={1 + 1.4 * encendida}
              opacity={(0.14 + 0.6 * encendida) * v}
            />
          );
        })}
      </svg>
      {NODOS.slice(1).map((n, i) => {
        const l = luz(n.nivel);
        const respira = 0.55 + 0.25 * Math.sin(i * 1.7 + ciclo * Math.PI * 2);
        const r = n.r * (1 + 0.6 * l);
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: n.x - r, top: n.y - r, width: 2 * r, height: 2 * r, borderRadius: 999,
              background: n.color, opacity: (respira + (1 - respira) * l) * entre(f, s(0.1 + (i % 7) * 0.08), s(0.7 + (i % 7) * 0.08)) * v,
              boxShadow: `0 0 ${6 + 26 * l}px ${alfa(n.color, 0.5 + 0.4 * l)}`,
            }}
          />
        );
      })}
      <Orbe
        p={NODOS[0]} r={34} color={AZUL} Icono={UserRound} visible={entre(f, s(0.2), s(0.9)) * v}
        brillo={ventana(f, s(1.6), s(2.0), s(7.4), s(8.4))} onda={entre(f, s(1.7), s(2.6)) * (f < s(2.6) ? 1 : 0)}
      />
    </Lienzo>
  );
}
