"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type EnlaceAdmin = { href: string; label: string };

/** Accesos del panel de MyOfia. El servidor decide cuáles recibe cada persona; aquí solo se marca el actual. */
export function NavSamgple({ enlaces }: { enlaces: EnlaceAdmin[] }) {
  const ruta = usePathname();
  const actual = (href: string) => (href === "/admin" ? ruta === "/admin" : ruta === href || ruta.startsWith(`${href}/`));
  return (
    <nav aria-label="Panel de MyOfia">
      <ul className="flex flex-wrap gap-1.5">
        {enlaces.map((e) => (
          <li key={e.href}>
            <Link
              href={e.href}
              aria-current={actual(e.href) ? "page" : undefined}
              className="glass glass-interactive inline-flex rounded-pill px-4 py-2 text-small aria-[current=page]:bg-white! aria-[current=page]:text-black"
            >
              {e.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
