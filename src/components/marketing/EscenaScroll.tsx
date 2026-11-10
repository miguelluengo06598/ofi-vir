"use client";

import Image from "next/image";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { scenes, type SceneId } from "@/data/scenes";
import { usePreferencias } from "./preferencias";

const escena = (id: SceneId) => scenes.find((s) => s.id === id)!;
const ORDEN: SceneId[] = ["dia", "atardecer", "noche"];

/**
 * Fondo fijo de la presentación: la oficina pasa de día a atardecer y a noche según se baja por la página.
 * Las tres fotos están apiladas; las de encima aparecen con opacity ligada al scroll (nunca se cambia el
 * diseño). Paralaje suave: la foto, un 8 % más grande, sube un poco mientras bajas.
 * Con movimiento reducido: escena fija (la de `fija`), sin paralaje ni fundidos.
 */
export function EscenaScroll({
  progreso,
  fija = "atardecer",
  paralaje = true,
}: {
  /** Avance 0→1 que mueve la escena. Por defecto, el scroll de toda la página. */
  progreso?: MotionValue<number>;
  fija?: SceneId;
  paralaje?: boolean;
}) {
  const { scrollYProgress } = useScroll();
  const p = progreso ?? scrollYProgress;
  const { reducido } = usePreferencias();

  // Día 0-25 %, fundido a atardecer 25-45 %, atardecer hasta 60 %, fundido a noche 60-85 %.
  const atardecer = useTransform(p, [0.25, 0.45], [0, 1]);
  const noche = useTransform(p, [0.6, 0.85], [0, 1]);
  const y = useTransform(p, [0, 1], ["0%", "-6%"]);

  if (reducido) {
    return (
      <div aria-hidden="true" className="fixed inset-0 -z-10 bg-black">
        <Capa id={fija} prioridad />
      </div>
    );
  }

  const opacidades: Record<SceneId, MotionValue<number> | number> = { dia: 1, atardecer, noche };
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-black">
      <motion.div className="absolute inset-[-2%_0_-9%_0] will-change-transform" style={paralaje ? { y } : undefined}>
        {ORDEN.map((id) => (
          <motion.div key={id} className="absolute inset-0" style={{ opacity: opacidades[id] }}>
            <Capa id={id} prioridad={id === "dia"} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function Capa({ id, prioridad }: { id: SceneId; prioridad?: boolean }) {
  const s = escena(id);
  return (
    <>
      <Image src={s.src} alt="" fill sizes="100vw" quality={70} priority={prioridad} className="object-cover" />
      <div className="absolute inset-0" style={{ background: `linear-gradient(rgba(0,0,0,${s.overlay[0] + 0.05}), rgba(0,0,0,${s.overlay[1] + 0.12}))` }} />
    </>
  );
}
