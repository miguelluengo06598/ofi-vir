"use client";

import { usePathname, useRouter } from "next/navigation";
import { dockNav, isActive } from "@/data/navigation";
import { GlassPanel } from "./GlassPanel";
import { PillButton } from "./PillButton";

/** Barra flotante: vertical a la izquierda en escritorio, inferior en móvil. */
export function Dock() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      aria-label="Dock"
      className="fixed inset-x-4 bottom-4 z-30 md:inset-x-auto md:top-1/2 md:bottom-auto md:left-4 md:-translate-y-1/2"
    >
      <GlassPanel className="flex items-center justify-around gap-2 rounded-pill p-2 md:flex-col md:justify-center">
        {dockNav.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <div key={href} className="group relative">
              <PillButton
                icon={Icon}
                active={active}
                solid
                aria-label={label}
                aria-pressed={undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => router.push(href)}
                className="size-11 justify-center p-0"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-full ml-3 hidden -translate-y-1/2 rounded-pill bg-black/70 px-3 py-1 text-small whitespace-nowrap text-white opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 md:block"
              >
                {label}
              </span>
            </div>
          );
        })}
      </GlassPanel>
    </nav>
  );
}
