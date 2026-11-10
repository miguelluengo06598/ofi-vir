"use client";

import { Bell, CalendarDays, MessageSquare, Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useApprovals } from "@/components/ApprovalsProvider";
import { currentUser, isActive, topNav } from "@/data/navigation";
import { Avatar } from "./Avatar";
import { GlassPanel } from "./GlassPanel";
import { PillButton } from "./PillButton";
import { SaldoPill } from "@/components/creditos/SaldoPill";
import { SceneMenu } from "./SceneMenu";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { pendingCount } = useApprovals();

  return (
    <header className="fixed inset-x-4 top-4 z-30">
      <GlassPanel className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-card p-2 lg:rounded-pill">
        <div className="flex items-center gap-2">
          <PillButton icon={SlidersHorizontal} aria-label="Filtros">
            <span className="hidden xl:inline">Filtros</span>
          </PillButton>
          <PillButton icon={CalendarDays} aria-label="Calendario">
            <span className="hidden xl:inline">Calendario</span>
          </PillButton>
        </div>

        <nav
          aria-label="Principal"
          className="order-last flex w-full gap-2 overflow-x-auto [scrollbar-width:none] lg:order-none lg:w-auto [&::-webkit-scrollbar]:hidden"
        >
          {topNav.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <PillButton
                key={href}
                compact
                active={active}
                aria-pressed={undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => router.push(href)}
              >
                {label}
              </PillButton>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <SaldoPill />
          {/* En móvil Mensajes ya está en el Dock. */}
          <span className="hidden sm:block">
            <PillButton icon={MessageSquare} aria-label="Mensajes" onClick={() => router.push("/mensajes")} />
          </span>
          <span className="relative">
            <PillButton icon={Bell} aria-label={pendingCount ? `Notificaciones, ${pendingCount} sin leer` : "Notificaciones"} />
            {pendingCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-red-500 text-tiny font-semibold text-white"
              >
                {pendingCount}
              </span>
            )}
          </span>
          <SceneMenu />
          <PillButton icon={Search} aria-label="Buscar" />
          <button
            type="button"
            aria-label={`Perfil de ${currentUser.name}`}
            className="cursor-pointer rounded-full"
          >
            <Avatar name={currentUser.name} status="working" statusLabel="En línea" />
          </button>
        </div>
      </GlassPanel>
    </header>
  );
}
