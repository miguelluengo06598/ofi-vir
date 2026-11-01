"use client";

import Image from "next/image";
import { useScene } from "@/lib/scene";
import { defaultScene, scenes } from "@/data/scenes";

/** Fondo a pantalla completa. Las tres escenas están apiladas y la activa se funde con las demás. */
export function Background() {
  const current = useScene();
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 bg-black">
      {scenes.map((s) => (
        <div
          key={s.id}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out motion-reduce:transition-none ${
            s.id === current ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={s.src}
            alt=""
            fill
            sizes="100vw"
            priority={s.id === defaultScene}
            className="object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(rgba(0,0,0,${s.overlay[0]}), rgba(0,0,0,${s.overlay[1]}))` }}
          />
        </div>
      ))}
    </div>
  );
}
