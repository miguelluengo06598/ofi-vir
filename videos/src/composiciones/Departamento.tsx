/**
 * departamento-* · 11 s en bucle. Fondo a pantalla completa del héroe de cada departamento (la web pone el
 * texto abajo a la izquierda), así que el motivo vive arriba a la derecha. Representativo, no la interfaz:
 *  - Ventas: leads que llegan al agente; los buenos acaban en una cita.
 *  - Atención: conversaciones que se resuelven; una queja pasa a una persona.
 *  - Marketing: datos que crecen y tres propuestas que se ordenan por impacto.
 *  - Operaciones · CRM: dos fichas duplicadas se funden y la ficha se completa.
 *  - Dirección: los departamentos informan al centro y reciben objetivos.
 */
import { BarChart3, CalendarCheck, Database, GitMerge, Megaphone, MessageCircle, Target, UserPlus, UserRound } from "lucide-react";
import type { ComponentType } from "react";
import { departmentColor, departmentMeta, type DepartmentId } from "@/components/glass/tokens";
import { entre, pulso, ventana } from "../comun/animar";
import { AMBAR, Burbuja, Ficha, Haz, LUZ, Lienzo, Orbe, Sello, alfa, pop, puntoDelHaz, useTiempo, type Punto } from "../comun/simbolos";

export function crearDepartamento(dep: DepartmentId): ComponentType {
  const Motivo = { ventas: Ventas, atencion: Atencion, marketing: Marketing, operaciones: Operaciones, direccion: Direccion }[dep];
  const Componente = () => (
    <Lienzo tinte={departmentColor[dep]} foco={{ x: 72, y: 38 }}>
      <Motivo />
    </Lienzo>
  );
  Componente.displayName = `Departamento-${dep}`;
  return Componente;
}

/* ───────────── Ventas ───────────── */
function Ventas() {
  const { f, s, vida } = useTiempo();
  const v = vida();
  const C: Punto = { x: 960, y: 320 };
  const color = departmentColor.ventas;
  const origenes: Punto[] = [{ x: 1330, y: 120 }, { x: 1330, y: 470 }, { x: 1180, y: 760 }, { x: 1330, y: 300 }];
  const cita: Punto = { x: 740, y: 160 };
  const llegadas = origenes.map((_, i) => 0.7 + i * 0.95);
  const onda = Math.max(...llegadas.map((t) => entre(f, s(t + 0.9), s(t + 1.6)) * (f < s(t + 1.6) ? 1 : 0)));
  const Icono = departmentMeta.ventas.icon;
  return (
    <>
      {origenes.map((o, i) => {
        const t = entre(f, s(llegadas[i]), s(llegadas[i] + 0.9));
        const p = puntoDelHaz(o, C, t, 0.12);
        return (
          <div key={i}>
            <Haz id={`v-${i}`} desde={o} hasta={C} t={t} visible={ventana(f, s(llegadas[i]), s(llegadas[i] + 0.3), s(llegadas[i] + 0.9), s(llegadas[i] + 1.4)) * 0.6 * v} color1={alfa(color, 0.2)} color2={color} curva={0.12} />
            <Orbe p={p} r={17} color={i === 1 ? LUZ : "#93C5FD"} Icono={UserPlus} visible={(t > 0 && t < 1 ? 1 : 0) * v} />
          </div>
        );
      })}
      <Haz id="v-cita" desde={C} hasta={cita} t={entre(f, s(5.4), s(6.5))} visible={entre(f, s(5.1), s(5.5)) * v} color1={color} color2={LUZ} />
      <Orbe p={C} r={50} color={color} Icono={Icono} visible={entre(f, s(0.1), s(0.8)) * v} brillo={0.4 + 0.6 * onda} onda={onda} />
      <Orbe p={cita} r={34} color={LUZ} Icono={CalendarCheck} visible={entre(f, s(5.0), s(5.6)) * v} brillo={pulso(f, s(6.7), s(1.2))} />
      <Sello p={pop(f, s(6.6), s(7.1)) * v} centro={{ x: cita.x + 26, y: cita.y - 26 }} />
    </>
  );
}

/* ───────────── Atención ───────────── */
function Atencion() {
  const { f, s, vida } = useTiempo();
  const v = vida();
  const color = departmentColor.atencion;
  const C: Punto = { x: 1080, y: 360 };
  const persona: Punto = { x: 1150, y: 130 };
  const turnos: { lado: "fuera" | "agente"; t: number; y: number }[] = [
    { lado: "fuera", t: 0.8, y: 120 },
    { lado: "agente", t: 1.6, y: 185 },
    { lado: "fuera", t: 2.6, y: 250 },
    { lado: "agente", t: 3.4, y: 315 },
    { lado: "fuera", t: 4.4, y: 380 },
  ];
  const Icono = departmentMeta.atencion.icon;
  const deriva = entre(f, s(5.6), s(6.8));
  return (
    <>
      {turnos.map((b, i) => (
        <Burbuja key={i} lado={b.lado} p={{ x: b.lado === "fuera" ? 640 : 730, y: b.y }} w={160} color={color} visible={pop(f, s(b.t), s(b.t + 0.5)) * v} />
      ))}
      <Sello p={pop(f, s(4.0), s(4.5)) * v} centro={{ x: 900, y: 345 }} />
      <Haz id="a-deriva" desde={{ x: 805, y: 400 }} hasta={persona} t={deriva} visible={entre(f, s(5.3), s(5.7)) * v} color1={alfa("#ffffff", 0.5)} color2={AMBAR} curva={-0.2} />
      <Orbe p={C} r={48} color={color} Icono={Icono} visible={entre(f, s(0.1), s(0.8)) * v} brillo={0.3 + 0.7 * pulso(f, s(2.0), s(1.4))} onda={entre(f, s(1.6), s(2.4)) * (f < s(2.4) ? 1 : 0)} />
      <Orbe p={persona} r={32} color={AMBAR} Icono={UserRound} visible={entre(f, s(5.2), s(5.8)) * v} brillo={pulso(f, s(6.9), s(1.2))} onda={entre(f, s(6.8), s(7.6)) * (f < s(7.6) ? 1 : 0)} />
      <Orbe p={{ x: 1185, y: 520 }} r={20} color={color} Icono={MessageCircle} visible={entre(f, s(0.4), s(1.0)) * v * 0.85} />
    </>
  );
}

/* ───────────── Marketing ───────────── */
function Marketing() {
  const { f, s, vida } = useTiempo();
  const v = vida();
  const color = departmentColor.marketing;
  const alturas = [70, 120, 95, 160, 205];
  const Icono = departmentMeta.marketing.icon;
  // Tres propuestas: aparecen en un orden y se reordenan por impacto (la tercera sube a la primera).
  const reorden = entre(f, s(5.4), s(6.4));
  const fila = (i: number) => 105 + i * 122;
  const posiciones = [
    fila(0) + (fila(1) - fila(0)) * reorden,
    fila(1) + (fila(2) - fila(1)) * reorden,
    fila(2) + (fila(0) - fila(2)) * reorden,
  ];
  return (
    <>
      {alturas.map((h, i) => {
        const crece = entre(f, s(0.6 + i * 0.25), s(1.6 + i * 0.25));
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: 640 + i * 44, top: 560 - h * crece, width: 28, height: h * crece, opacity: v,
              borderRadius: 8, background: `linear-gradient(${color}, ${alfa(color, 0.25)})`,
              boxShadow: i === 4 ? `0 0 ${24 * pulso(f, s(2.8), s(1.4))}px ${alfa(LUZ, 0.8)}` : undefined,
            }}
          />
        );
      })}
      <Orbe p={{ x: 730, y: 220 }} r={46} color={color} Icono={Icono} visible={entre(f, s(0.1), s(0.8)) * v} brillo={0.3 + 0.7 * pulso(f, s(3.2), s(1.6))} />
      <Orbe p={{ x: 1210, y: 560 }} r={20} color={color} Icono={BarChart3} visible={entre(f, s(0.5), s(1.1)) * v * 0.85} />
      {posiciones.map((y, i) => {
        const aparece = entre(f, s(3.2 + i * 0.45), s(3.9 + i * 0.45)) * v;
        const primero = i === 2 ? reorden : 0;
        return (
          <div key={i}>
            <Ficha x={930} y={y} w={250} lineas={2} visible={aparece} Icono={Megaphone} color={color} resalte={{ linea: 0, p: primero * entre(f, s(6.4), s(7.0)) }} />
            <Sello p={aparece * (i === 2 ? pop(f, s(6.5), s(7.0)) : 0)} centro={{ x: 1180, y: y + 6 }} Icono={Target} color={LUZ} />
          </div>
        );
      })}
    </>
  );
}

/* ───────────── Operaciones · CRM ───────────── */
function Operaciones() {
  const { f, s, vida } = useTiempo();
  const v = vida();
  const color = departmentColor.operaciones;
  const Icono = departmentMeta.operaciones.icon;
  const junta = entre(f, s(2.0), s(3.4));
  const centro = { x: 840, y: 210 };
  const a = { x: 680 + (centro.x - 680) * junta, y: 130 + (centro.y - 130) * junta };
  const b = { x: 1010 + (centro.x - 1010) * junta, y: 320 + (centro.y - 320) * junta };
  const fusion = pulso(f, s(3.5), s(1.2));
  const rellena = 0.45 + 0.55 * entre(f, s(4.4), s(6.8));
  const linea = Math.min(4, Math.floor(rellena * 5));
  const orbe: Punto = { x: 1180, y: 520 };
  return (
    <>
      <Ficha x={b.x} y={b.y} w={250} lineas={5} relleno={0.45} visible={entre(f, s(0.6), s(1.3)) * (1 - entre(f, s(3.2), s(3.6))) * v} Icono={UserRound} color={color} />
      <Ficha
        x={a.x} y={a.y} w={250} lineas={5} relleno={rellena} visible={entre(f, s(0.3), s(1.0)) * v} Icono={UserRound} color={color}
        resalte={{ linea, p: ventana(f, s(4.4), s(4.7), s(6.8), s(7.4)) }}
      />
      <Orbe p={{ x: centro.x + 125, y: centro.y + 95 }} r={28} color={color} Icono={GitMerge} visible={fusion * v} brillo={1} onda={entre(f, s(3.4), s(4.2)) * (f < s(4.2) ? 1 : 0)} />
      <Haz id="o-crm" desde={orbe} hasta={{ x: centro.x + 250, y: centro.y + 120 }} t={entre(f, s(4.2), s(5.0))} visible={ventana(f, s(4.0), s(4.3), s(6.8), s(7.4)) * v} color1={color} color2={LUZ} curva={-0.18} />
      <Orbe p={orbe} r={44} color={color} Icono={Icono} visible={entre(f, s(0.1), s(0.8)) * v} brillo={0.3 + 0.7 * pulso(f, s(4.2), s(1.4))} />
      <Orbe p={{ x: 1210, y: 330 }} r={20} color={color} Icono={Database} visible={entre(f, s(0.5), s(1.1)) * v * 0.85} />
      <Sello p={pop(f, s(7.0), s(7.5)) * v} centro={{ x: centro.x + 250, y: centro.y + 4 }} />
    </>
  );
}

/* ───────────── Dirección ───────────── */
function Direccion() {
  const { f, s, vida, total } = useTiempo();
  const v = vida();
  const C: Punto = { x: 950, y: 310 };
  const deps: DepartmentId[] = ["ventas", "atencion", "marketing", "operaciones"];
  const giro = 0.18 * Math.sin((2 * Math.PI * f) / s(total));
  const satelites = deps.map((d, i) => {
    const ang = -Math.PI / 2 + (i * Math.PI) / 2 + Math.PI / 4 + giro;
    return { d, p: { x: C.x + 210 * Math.cos(ang), y: C.y + 175 * Math.sin(ang) } };
  });
  const informes = deps.map((_, i) => 0.9 + i * 0.4);
  const objetivos = deps.map((_, i) => 4.4 + i * 0.35);
  const recibe = Math.max(...informes.map((t) => pulso(f, s(t + 0.8), s(0.8))));
  return (
    <>
      {satelites.map(({ d, p }, i) => (
        <div key={d}>
          <Haz id={`d-in-${d}`} desde={p} hasta={C} t={entre(f, s(informes[i]), s(informes[i] + 0.8))} visible={ventana(f, s(informes[i] - 0.2), s(informes[i]), s(informes[i] + 0.8), s(informes[i] + 1.2)) * v} color1={departmentColor[d]} color2={LUZ} curva={0.1} />
          <Haz id={`d-out-${d}`} desde={C} hasta={p} t={entre(f, s(objetivos[i]), s(objetivos[i] + 0.8))} visible={ventana(f, s(objetivos[i] - 0.2), s(objetivos[i]), s(objetivos[i] + 0.9), s(objetivos[i] + 1.6)) * v} color1={LUZ} color2={departmentColor[d]} curva={0.1} />
        </div>
      ))}
      {satelites.map(({ d, p }, i) => (
        <div key={`o-${d}`}>
          <Orbe p={p} r={30} color={departmentColor[d]} Icono={departmentMeta[d].icon} visible={entre(f, s(0.2 + i * 0.12), s(0.9 + i * 0.12)) * v} brillo={pulso(f, s(objetivos[i] + 0.85), s(1))} />
          <Sello p={pop(f, s(objetivos[i] + 0.8), s(objetivos[i] + 1.2)) * v} centro={{ x: p.x + 24, y: p.y - 24 }} r={12} Icono={Target} color={LUZ} />
        </div>
      ))}
      <Orbe p={C} r={52} color="#A8B0BD" Icono={departmentMeta.direccion.icon} visible={entre(f, s(0.1), s(0.8)) * v} brillo={0.35 + 0.65 * Math.max(recibe, pulso(f, s(3.6), s(1.4)))} onda={entre(f, s(3.2), s(4.2)) * (f < s(4.2) ? 1 : 0)} />
    </>
  );
}
