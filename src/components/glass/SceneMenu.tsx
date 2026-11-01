"use client";

import { Moon, Sun, Sunset, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { scenes, type SceneId } from "@/data/scenes";
import { setScene, useScene } from "@/lib/scene";
import { GlassPanel } from "./GlassPanel";
import { PillButton } from "./PillButton";

const icons: Record<SceneId, LucideIcon> = { dia: Sun, atardecer: Sunset, noche: Moon };

/** Botón de la TopBar que abre el selector de escena (día / atardecer / noche). */
export function SceneMenu() {
  const current = useScene();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const label = scenes.find((s) => s.id === current)!.label;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector<HTMLElement>("[data-scene-trigger]")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <PillButton
        data-scene-trigger
        icon={icons[current]}
        aria-label={`Escena: ${label}. Cambiar escena`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-pressed={undefined}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <GlassPanel
          role="group"
          aria-label="Escena de fondo"
          className="absolute top-full right-0 z-40 mt-3 flex w-44 flex-col gap-1 rounded-card! p-2"
        >
          {scenes.map((s) => (
            <PillButton
              key={s.id}
              icon={icons[s.id]}
              active={s.id === current}
              onClick={() => {
                setScene(s.id);
                setOpen(false);
              }}
              className="justify-start"
            >
              {s.label}
            </PillButton>
          ))}
        </GlassPanel>
      )}
    </div>
  );
}
