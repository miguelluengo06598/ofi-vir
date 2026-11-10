import Image from "next/image";
import { defaultScene, scenes } from "@/data/scenes";

const escena = scenes.find((s) => s.id === defaultScene)!;

/**
 * Fondo fijo de la web pública: la misma escena de atardecer que la oficina, sin el selector
 * (ni localStorage ni JavaScript). next/image sirve AVIF/WebP al tamaño de cada pantalla.
 */
export function EscenaPublica() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 bg-black">
      <Image src={escena.src} alt="" fill priority sizes="100vw" quality={70} className="object-cover" />
      {/* Algo más oscuro que en la oficina: aquí hay más texto largo directamente sobre la escena. */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(rgba(0,0,0,${escena.overlay[0] + 0.05}), rgba(0,0,0,${escena.overlay[1] + 0.12}))` }}
      />
    </div>
  );
}
