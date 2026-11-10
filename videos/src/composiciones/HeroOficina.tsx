/**
 * hero-oficina-cobra-vida · 15 s en bucle perfecto (el último fotograma enlaza con el primero).
 * La cámara se acerca a la oficina al atardecer, aparecen los paneles de departamento, entra un lead,
 * Lucía se enciende, una partícula viaja a Iván y la ficha del CRM se actualiza. Luego todo se recoge.
 *
 * Usa los componentes reales de la oficina: GlassCard, GlassPanel, Avatar, StatusBadge y la curva de los
 * traspasos (handoffs/curva.ts). Todo se anima con el número de fotograma.
 */
import { Database, Target } from "lucide-react";
import type { CSSProperties } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Avatar } from "@/components/glass/Avatar";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { StatusBadge } from "@/components/glass/StatusBadge";
import { departmentColor, type DepartmentId } from "@/components/glass/tokens";
import type { Rect } from "@/components/handoffs/curva";
import { agentesDe, campana, leadPrincipal, tareaEnCurso } from "../../datos-ejemplo";
import { entre, pulso, ventana } from "../comun/animar";
import { EtiquetaDemo, Escenario, useLienzo } from "../comun/escenario";
import { LineaYParticula } from "../comun/Particula";

const ORDEN: DepartmentId[] = ["ventas", "atencion", "marketing", "operaciones", "direccion"];
const ALTO_TARJETA = 222;

/** Momentos clave en segundos (todo lo demás se deriva de aquí). */
const T = {
  paneles: 0.3,
  crm: 1.6,
  lead: 2.6,
  leadEntra: 3.6,
  luciaSeEnciende: 4.0,
  viaje: 5.2,
  llegada: 6.6,
  recoger: 12.6,
  fin: 15,
};

type Distribucion = { tarjetas: Record<DepartmentId, Rect>; crm: Rect; aviso: { x: number; y: number; w: number } };

function distribucion(vertical: boolean): Distribucion {
  if (vertical) {
    // 720 × 1280: rejilla de 2 columnas; la ficha del CRM arriba.
    const w = 320;
    const col = (i: number) => 30 + i * (w + 20);
    const fila = (i: number) => 540 + i * (ALTO_TARJETA + 22);
    return {
      tarjetas: {
        ventas: { x: col(0), y: fila(0), w, h: ALTO_TARJETA },
        atencion: { x: col(1), y: fila(0), w, h: ALTO_TARJETA },
        marketing: { x: col(0), y: fila(1), w, h: ALTO_TARJETA },
        operaciones: { x: col(1), y: fila(1), w, h: ALTO_TARJETA },
        direccion: { x: (720 - w) / 2, y: fila(2), w, h: ALTO_TARJETA },
      },
      crm: { x: 30, y: 270, w: 660, h: 230 },
      aviso: { x: 30, y: 150, w: 420 },
    };
  }
  // 1280 × 720: fila de 5 paneles flotando frente a los ventanales.
  const w = 220;
  const x = (i: number) => 50 + i * (w + 15);
  const tarjetas = Object.fromEntries(ORDEN.map((d, i) => [d, { x: x(i), y: 430, w, h: ALTO_TARJETA }])) as Record<DepartmentId, Rect>;
  return { tarjetas, crm: { x: 810, y: 120, w: 410, h: 230 }, aviso: { x: 50, y: 250, w: 400 } };
}

export function HeroOficina() {
  const f = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { vertical } = useLienzo();
  const s = (seg: number) => seg * fps;
  const d = distribucion(vertical);

  // Cámara: se acerca y vuelve a su sitio (coseno: el bucle no tiene costura).
  const ciclo = (1 - Math.cos((2 * Math.PI * f) / durationInFrames)) / 2;
  const camara = 1 + 0.05 * ciclo;

  // Todo lo que aparece se recoge al final para que el fotograma final enlace con el primero.
  const recogida = 1 - entre(f, s(T.recoger), s(T.fin - 0.4));

  const luciaActiva = f >= s(T.luciaSeEnciende) && f < s(T.recoger + 1);
  const ivanActivo = f >= s(T.llegada) && f < s(T.recoger + 1);
  const viaje = entre(f, s(T.viaje), s(T.llegada));
  const actualizado = entre(f, s(T.llegada + 0.3), s(T.llegada + 0.9));

  return (
    <Escenario>
      {/* Escena con cámara: la foto y los paneles se acercan juntos. */}
      <AbsoluteFill style={{ scale: String(camara), transformOrigin: "50% 62%" }}>
        <Img src={staticFile("scenes/oficina-atardecer.png")} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
        <AbsoluteFill style={{ background: "linear-gradient(rgba(0,0,0,0.30), rgba(0,0,0,0.52))" }} />

        <LineaYParticula
          id="traspaso"
          desde={d.tarjetas.ventas}
          hasta={d.tarjetas.operaciones}
          t={viaje}
          visible={ventana(f, s(T.viaje - 0.3), s(T.viaje), s(T.llegada + 0.4), s(T.llegada + 1.4)) * recogida}
          colorDesde={departmentColor.ventas}
          colorHasta={departmentColor.operaciones}
        />

        {ORDEN.map((dep, i) => {
          const r = d.tarjetas[dep];
          const aparicion = entre(f, s(T.paneles + i * 0.12), s(T.paneles + i * 0.12 + 0.9));
          const visible = aparicion * recogida;
          const brillo =
            dep === "ventas" ? pulso(f, s(T.leadEntra + 0.15), s(1)) : dep === "operaciones" ? pulso(f, s(T.llegada + 0.2), s(1.1)) : 0;
          return (
            <div
              key={dep}
              style={{
                position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h,
                opacity: visible, translate: `0px ${(1 - visible) * 28}px`,
              }}
            >
              <PanelDepartamento dep={dep} luciaActiva={luciaActiva} ivanActivo={ivanActivo} />
              <div
                style={{
                  position: "absolute", inset: 0, borderRadius: 20, pointerEvents: "none", opacity: brillo,
                  boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.65), inset 0 0 44px rgba(255,212,138,0.45), 0 0 40px rgba(255,212,138,0.35)",
                }}
              />
            </div>
          );
        })}

        <AvisoLead f={f} s={s} pos={d.aviso} destino={d.tarjetas.ventas} recogida={recogida} />
        <FichaCrm f={f} s={s} r={d.crm} actualizado={actualizado} recogida={recogida} />
      </AbsoluteFill>

      {/* Viñeta suave para que la etiqueta y los bordes se lean. */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%)" }} />
      <EtiquetaDemo />
    </Escenario>
  );
}

function PanelDepartamento({ dep, luciaActiva, ivanActivo }: { dep: DepartmentId; luciaActiva: boolean; ivanActivo: boolean }) {
  const equipo = agentesDe(dep);
  const activo = (id: string) => (id === "lucia" ? luciaActiva : id === "ivan" ? ivanActivo : id === "sara" || id === "teo" || id === "atlas");
  const descripcion =
    dep === "ventas" ? (luciaActiva ? `Lucía responde a ${leadPrincipal.nombre.split(" ")[0]}` : "Esperando leads nuevos")
    : dep === "operaciones" ? (ivanActivo ? `Iván registra a ${leadPrincipal.nombre.split(" ")[0]} en el CRM` : "CRM al día")
    : tareaEnCurso[dep];
  const trabajando = equipo.filter((a) => activo(a.id)).length;
  return (
    <GlassCard department={dep} description={descripcion} className="h-full">
      <ul className="flex -space-x-2">
        {equipo.map((a) => {
          const enciende = (a.id === "lucia" && luciaActiva) || (a.id === "ivan" && ivanActivo);
          return (
            <li key={a.id} style={{ borderRadius: 999, boxShadow: enciende ? "0 0 0 2px #fff, 0 0 22px 4px rgba(255,212,138,0.75)" : undefined }}>
              <Avatar name={a.nombre} tone={dep} status={activo(a.id) ? "working" : "paused"} />
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {trabajando > 0 && <StatusBadge status="working" count={trabajando} />}
        {equipo.length - trabajando > 0 && <StatusBadge status="paused" count={equipo.length - trabajando} />}
      </div>
    </GlassCard>
  );
}

function AvisoLead({ f, s, pos, destino, recogida }: { f: number; s: (n: number) => number; pos: { x: number; y: number; w: number }; destino: Rect; recogida: number }) {
  const entra = entre(f, s(T.lead), s(T.lead + 0.6));
  const vuela = entre(f, s(T.leadEntra - 0.5), s(T.leadEntra + 0.1));
  const x = interpolate(vuela, [0, 1], [pos.x, destino.x + destino.w / 2 - 60]);
  const y = interpolate(vuela, [0, 1], [pos.y, destino.y + 60]);
  const estilo: CSSProperties = {
    position: "absolute", left: 0, top: 0, width: pos.w,
    translate: `${x}px ${y + (1 - entra) * 16}px`,
    scale: String(1 - 0.4 * vuela),
    transformOrigin: "0 0",
    opacity: entra * (1 - entre(f, s(T.leadEntra - 0.3), s(T.leadEntra + 0.1))) * recogida,
  };
  return (
    <div style={estilo}>
      <GlassPanel strong className="flex items-center gap-3 rounded-card! px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: `linear-gradient(135deg, ${departmentColor.marketing}, ${departmentColor.marketing}66)` }}>
          <Target size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-tiny text-ink-2">Lead nuevo · {campana.canal}</p>
          <p className="text-small font-semibold">{leadPrincipal.nombre} · {leadPrincipal.interes}</p>
        </div>
      </GlassPanel>
    </div>
  );
}

function FichaCrm({ f, s, r, actualizado, recogida }: { f: number; s: (n: number) => number; r: Rect; actualizado: number; recogida: number }) {
  const aparece = entre(f, s(T.crm), s(T.crm + 0.8)) * recogida;
  const resalte = pulso(f, s(T.llegada + 0.9), s(1.6));
  const fila = (campo: string, antes: string, despues: string, cambia: boolean) => (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-3 border-t border-white/10 py-2 text-small">
      <span className="text-ink-2">{campo}</span>
      <span className="relative">
        {cambia ? (
          <>
            <span style={{ opacity: 1 - actualizado, position: "absolute", left: 0, top: 0 }}>{antes}</span>
            <span
              className="rounded px-1 -mx-1"
              style={{ opacity: actualizado, background: `rgba(255,212,138,${0.28 * resalte})` }}
            >
              {despues}
            </span>
          </>
        ) : (
          despues
        )}
      </span>
    </div>
  );
  return (
    <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, opacity: aparece, translate: `0px ${(1 - aparece) * 20}px` }}>
      <GlassPanel className="rounded-card! p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-small font-semibold">
            <Database size={15} /> CRM · Ficha de contacto
          </p>
          <span className="rounded-pill bg-black/30 px-2 py-0.5 text-tiny">
            {leadPrincipal.nombre}
          </span>
        </div>
        <div className="mt-2">
          {fila("Origen", leadPrincipal.origen, leadPrincipal.origen, false)}
          {fila("Etapa", leadPrincipal.fichaAntes.etapa, leadPrincipal.fichaDespues.etapa, true)}
          {fila("Próximo paso", leadPrincipal.fichaAntes.proximoPaso, leadPrincipal.fichaDespues.proximoPaso, true)}
          {fila("Actualizado", leadPrincipal.fichaAntes.actualizado, leadPrincipal.fichaDespues.actualizado, true)}
        </div>
      </GlassPanel>
    </div>
  );
}
