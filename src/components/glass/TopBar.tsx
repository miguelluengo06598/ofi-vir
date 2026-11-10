"use client";

import { Bell, CalendarDays, ChevronDown, LogOut, MessageSquare, Search, SlidersHorizontal, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useApprovals } from "@/components/ApprovalsProvider";
import { isActive, topNav } from "@/data/navigation";
import { Avatar } from "./Avatar";
import { GlassPanel } from "./GlassPanel";
import { PillButton } from "./PillButton";
import { SaldoPill } from "@/components/creditos/SaldoPill";
import { SelectorEmpresa } from "@/components/empresas/SelectorEmpresa";
import { SceneMenu } from "./SceneMenu";
import { cerrarSesion } from "@/app/(acceso)/acciones";
import type { RolEmpresa } from "@/lib/empresas/permisos";

export function TopBar({ usuario, rol }: { usuario: { nombre: string; email: string }; rol: RolEmpresa }) {
  const pathname = usePathname();
  const router = useRouter();
  const { pendingCount } = useApprovals();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const gestionaMiembros = rol === "propietario" || rol === "admin";

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
          <SelectorEmpresa />
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
          <div className="relative">
            <button type="button" aria-label={`Perfil de ${usuario.nombre}`} aria-expanded={menuAbierto} onClick={() => setMenuAbierto((v) => !v)} className="flex cursor-pointer items-center gap-1 rounded-full">
              <Avatar name={usuario.nombre} status="working" statusLabel="En línea" />
              <ChevronDown size={14} className="hidden text-ink-2 lg:block" />
            </button>
            {menuAbierto && <div className="absolute right-0 mt-3 w-64 rounded-card border border-white/15 bg-black/80 p-2 shadow-2xl backdrop-blur-xl">
              <div className="px-3 py-2"><p className="truncate text-small font-semibold">{usuario.nombre}</p><p className="truncate text-tiny text-ink-2">{usuario.email}</p></div>
              <div className="my-1 border-t border-white/15" />
              <Link href="/cuenta" onClick={() => setMenuAbierto(false)} className="block rounded-pill px-3 py-2 text-small hover:bg-white/10">Mi cuenta</Link>
              {gestionaMiembros && <Link href="/miembros" onClick={() => setMenuAbierto(false)} className="flex items-center gap-2 rounded-pill px-3 py-2 text-small hover:bg-white/10"><Users size={15} />Miembros</Link>}
              <div className="my-1 border-t border-white/15" />
              <form action={cerrarSesion}><button type="submit" className="flex w-full items-center gap-2 rounded-pill px-3 py-2 text-left text-small text-red-100 hover:bg-red-500/15"><LogOut size={15} />Cerrar sesión</button></form>
            </div>}
          </div>
        </div>
      </GlassPanel>
    </header>
  );
}
