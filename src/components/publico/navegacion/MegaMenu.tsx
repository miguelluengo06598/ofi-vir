"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { departmentMeta } from "@/components/glass/tokens";
import { video } from "@/config/videos";
import { DEPARTAMENTOS } from "@/content/departamentos";
import { SECTORES } from "@/content/sectores";
import { MiniVideo } from "./MiniVideo";

type Props = { tipo: "departamentos" | "sectores"; id: string; ruta: string; alCerrar: () => void };

/** Panel grande de cristal bajo la cabecera, con una tarjeta por departamento o sector. */
export function MegaMenu({ tipo, id, ruta, alCerrar }: Props) {
  const [encima, setEncima] = useState<string | null>(null);
  const tarjeta = "group flex h-full flex-col gap-2 rounded-card p-3 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 aria-[current=page]:bg-white/15";

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="glass mx-auto mt-2 max-w-7xl rounded-panel p-4 [--glass-fill:rgba(18,18,26,0.62)]"
    >
      {tipo === "departamentos" ? (
        <ul className="grid grid-cols-5 gap-2">
          {DEPARTAMENTOS.map((d) => {
            const Icono = departmentMeta[d.tono].icon;
            const href = `/departamentos/${d.slug}`;
            return (
              <li key={d.slug}>
                <Link
                  href={href}
                  onClick={alCerrar}
                  aria-current={ruta === href ? "page" : undefined}
                  onPointerEnter={() => setEncima(d.slug)}
                  onPointerLeave={() => setEncima((e) => (e === d.slug ? null : e))}
                  onFocus={() => setEncima(d.slug)}
                  onBlur={() => setEncima((e) => (e === d.slug ? null : e))}
                  className={tarjeta}
                >
                  <MiniVideo fuentes={video(d.video)} activo={encima === d.slug} />
                  <span className="mt-1 flex items-center gap-2 text-small font-semibold">
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${departmentMeta[d.tono].avatar}`}>
                      <Icono size={14} aria-hidden="true" />
                    </span>
                    {d.nombre}
                  </span>
                  <span className="text-tiny leading-snug text-ink-2">{d.linea}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {SECTORES.map((s) => {
            const Icono = s.icono;
            const href = `/sectores/${s.slug}`;
            return (
              <li key={s.slug}>
                <Link href={href} onClick={alCerrar} aria-current={ruta === href ? "page" : undefined} className={`${tarjeta} flex-row! items-start gap-3`}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                    <Icono size={17} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-small font-semibold">{s.nombre}</span>
                    <span className="block text-tiny leading-snug text-ink-2">{s.linea}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-white/10 px-3 pt-3 text-small">
        <span className="text-ink-2">
          {tipo === "departamentos" ? "Departamentos y agentes gratis: solo pagas por las tareas." : "Ejemplos de uso por sector."}
        </span>
        <Link href={`/${tipo}`} onClick={alCerrar} className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-semibold hover:bg-white/10">
          {tipo === "departamentos" ? "Ver todos los departamentos" : "Ver todos los sectores"} <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </motion.div>
  );
}
