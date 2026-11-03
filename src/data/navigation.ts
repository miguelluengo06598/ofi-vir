import {
  Bot,
  Building2,
  CheckCircle2,
  Coins,
  ListChecks,
  MessageSquare,
  Network,
  Star,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Píldoras centrales de la TopBar. */
export const topNav: NavItem[] = [
  { href: "/", label: "Oficina", icon: Building2 },
  { href: "/agentes", label: "Agentes", icon: Bot },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/memoria", label: "Memoria", icon: Network },
  { href: "/creditos", label: "Créditos", icon: Coins },
];

/** Botones circulares del Dock. */
export const dockNav: NavItem[] = [
  { href: "/", label: "Oficina", icon: Building2 },
  { href: "/mensajes", label: "Mensajes", icon: MessageSquare },
  { href: "/tareas", label: "Tareas", icon: ListChecks },
  { href: "/aprobaciones", label: "Aprobaciones", icon: CheckCircle2 },
  { href: "/memoria", label: "Memoria", icon: Network },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/creditos", label: "Créditos", icon: Wallet },
  { href: "/favoritos", label: "Favoritos", icon: Star },
];

export const currentUser = { name: "Marcos Gil" };

/** Coincidencia de ruta activa: «/» solo exacta; el resto por prefijo. */
export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
