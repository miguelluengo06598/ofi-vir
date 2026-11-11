"use client";

import { DemoEnVivo, demoDiferida } from "@/components/marketing/DemoEnVivo";
import { SeccionFija, type PasoFijo } from "@/components/marketing/SeccionFija";
import { VideoProducto } from "@/components/marketing/VideoProducto";
import { ReservaDemoOficina } from "@/components/publico/ReservaDemoOficina";
import { video } from "@/config/videos";
import { recorridoProducto } from "@/content/producto";

const Replica = demoDiferida<{ paso: number }>(() => import("./ReplicaOficina"));
const Interactiva = demoDiferida(() => import("./DemoInteractiva"));

const ALTO_REPLICA = "min(36rem, calc(100svh - 11rem))";

function VideoPequeno({ id }: { id: NonNullable<(typeof recorridoProducto)[number]["video"]> }) {
  const f = video(id);
  return (
    <div className="relative max-w-sm">
      <VideoProducto poster={f.posterWebp} webm={f.webm} mp4={f.mp4} ancho={f.ancho} alto={f.alto} descripcion={f.descripcion} sizes="24rem" />
      {f.provisional && <span className="absolute top-2 left-2 rounded-pill bg-black/55 px-2 py-0.5 text-tiny text-white/85 ring-1 ring-white/20">Vídeo provisional</span>}
    </div>
  );
}

/** Recorrido por la interfaz: la réplica de la oficina se queda fija y va resaltando una parte en cada paso. */
export function RecorridoProducto() {
  const pasos: PasoFijo[] = recorridoProducto.map((p) => ({
    titulo: p.titulo,
    texto: p.texto,
    extra: p.video ? <VideoPequeno id={p.video} /> : undefined,
  }));
  return (
    <SeccionFija
      etiqueta="Recorrido por la oficina"
      pasos={pasos}
      vhPorPaso={70}
      amplio
      altoVisual={ALTO_REPLICA}
      altoVisualMovil="min(21rem, calc(100svh - 24rem))"
      visualFijo={(paso) => (
        <DemoEnVivo
          componente={Replica}
          props={{ paso }}
          className="size-full"
          reserva={<div className="size-full rounded-card bg-white/5 ring-1 ring-white/10" />}
          descripcion="Réplica de la oficina con datos de ejemplo: departamentos, panel de departamento, mensajes, aprobaciones, memoria, traspasos en directo y créditos."
        />
      )}
    />
  );
}

/** Demo grande del final: la oficina real con datos de ejemplo, para pulsar los departamentos. */
export function DemoProducto() {
  return (
    <DemoEnVivo
      componente={Interactiva}
      reserva={<ReservaDemoOficina />}
      descripcion="Oficina de demostración: cinco departamentos que se pueden abrir para ver sus agentes, aprobaciones y traspasos. Datos de ejemplo."
      etiqueta="Pruébala · datos de ejemplo"
    />
  );
}
