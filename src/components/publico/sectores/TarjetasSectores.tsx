"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { scenes } from "@/data/scenes";
import { SECTORES } from "@/content/sectores";

/**
 * Tarjetas grandes de los sectores. La inclinación es una respuesta física al puntero, no una
 * decoración independiente: usa solamente transform y también funciona como enlace normal al teclado.
 */
export function TarjetasSectores() {
  return (
    <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {SECTORES.map((sector) => <TarjetaSector key={sector.slug} slug={sector.slug} />)}
    </ul>
  );
}

function TarjetaSector({ slug }: { slug: (typeof SECTORES)[number]["slug"] }) {
  const sector = SECTORES.find((item) => item.slug === slug)!;
  const escena = scenes.find((item) => item.id === sector.escena)!;
  const Icono = sector.icono;
  const rotateX = useSpring(useMotionValue(0), { stiffness: 230, damping: 22, mass: 0.5 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 230, damping: 22, mass: 0.5 });

  const inclinar = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "touch") return;
    const caja = event.currentTarget.getBoundingClientRect();
    rotateY.set(((event.clientX - caja.left) / caja.width - 0.5) * 7);
    rotateX.set(((event.clientY - caja.top) / caja.height - 0.5) * -7);
  };
  const reiniciar = () => { rotateX.set(0); rotateY.set(0); };

  return (
    <li style={{ perspective: 900 }}>
      <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }} whileHover={{ y: -6 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
        <Link
          href={"/sectores/" + sector.slug}
          onPointerMove={inclinar}
          onPointerLeave={reiniciar}
          onBlur={reiniciar}
          className="glass glass-interactive group relative flex min-h-80 overflow-hidden rounded-card p-6 text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          <Image src={escena.src} alt="" fill sizes="(min-width: 1280px) 31vw, (min-width: 768px) 48vw, 100vw" className="object-cover opacity-45" />
          <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/80 via-black/35 to-black/15" />
          <span aria-hidden="true" className="absolute -top-16 -right-12 size-48 rounded-full blur-3xl" style={{ background: sector.acento + "55" }} />
          <span className="relative flex h-full flex-1 flex-col">
            <span className="flex size-11 items-center justify-center rounded-full bg-black/35 ring-1 ring-white/25"><Icono size={20} aria-hidden="true" /></span>
            <span className="mt-6 text-[26px] leading-tight font-semibold tracking-[-0.02em]">{sector.nombre}</span>
            <span className="mt-2 text-small leading-relaxed text-white/78">{sector.linea}</span>
            <span className="mt-auto pt-7 text-small leading-relaxed text-white/90">{sector.ejemplo}</span>
            <span className="mt-5 inline-flex items-center gap-1.5 text-small font-semibold">Ver cómo encaja <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-1" /></span>
          </span>
        </Link>
      </motion.div>
    </li>
  );
}
