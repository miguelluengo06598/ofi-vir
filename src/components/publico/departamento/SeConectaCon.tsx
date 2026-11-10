"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { createRef, useMemo, useRef, useState, type RefObject } from "react";
import { Avatar } from "@/components/glass";
import { departmentColor, departmentMeta, type DepartmentId } from "@/components/glass/tokens";
import { LineaDeLuz } from "@/components/marketing/LineaDeLuz";
import { LUZ } from "@/components/marketing/tipografia";
import { DEPARTAMENTOS, type FichaDepartamento } from "@/content/departamentos";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { PorRevisar } from "./PorRevisar";

type Props = { tono: DepartmentId; nombre: string; ficha: FichaDepartamento };

/**
 * «Se conecta con»: el departamento en el centro, sus herramientas arriba y los departamentos con los que
 * habla abajo. De él salen partículas de luz hacia cada uno (la misma curva y partícula que la oficina) y el
 * destino destella al recibirla. Como en la oficina, en móvil no hay líneas: solo las tarjetas.
 */
export function SeConectaCon({ tono, nombre, ficha }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const centro = useRef<HTMLDivElement>(null);
  const lineas = useMediaQuery("(min-width: 768px)");
  const total = ficha.herramientas.length + ficha.departamentos.length;
  const refs = useMemo(() => Array.from({ length: total }, () => createRef<HTMLDivElement>()), [total]);
  const [llegadas, setLlegadas] = useState<number[]>(() => Array(total).fill(0));
  const llegar = (i: number) => setLlegadas((l) => l.map((n, k) => (k === i ? n + 1 : n)));
  const nH = ficha.herramientas.length;
  const Icono = departmentMeta[tono].icon;

  return (
    <div ref={contenedor} className="relative">
      {lineas &&
        refs.map((r, i) => {
          const dep = i >= nH ? ficha.departamentos[i - nH] : null;
          return (
            <LineaDeLuz
              key={i}
              contenedor={contenedor}
              desde={centro}
              hasta={r}
              cadaMs={3200 + ((i * 670) % 1900)}
              duracion={1.5}
              colorDesde={ficha.acento}
              colorHasta={dep ? departmentColor[dep.con] : LUZ}
              alLlegar={() => llegar(i)}
            />
          );
        })}

      <p className="mb-3 text-tiny font-semibold tracking-[0.18em] text-ink-2 uppercase md:text-center">Herramientas que conecta</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ficha.herramientas.map((h, i) => (
          <li key={h.nombre}>
            <Nodo refNodo={refs[i]} llegadas={llegadas[i]} color={LUZ}>
              <span className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/90">
                  {h.logo ? <Image src={h.logo} alt="" width={22} height={22} /> : <Mail size={18} className="text-neutral-800" aria-hidden="true" />}
                </span>
                <span className="text-body font-semibold">{h.nombre}</span>
              </span>
              <span className="mt-2 block text-small text-ink-2">{h.para}</span>
              {!h.proveedor && <span className="mt-2 block text-tiny text-ink-3">Incluido: no hay que conectar nada.</span>}
              <PorRevisar revisar={h.revisar} className="mt-2" />
            </Nodo>
          </li>
        ))}
      </ul>

      <div className="my-10 flex justify-center md:my-24">
        <div
          ref={centro}
          className="glass is-active relative flex items-center gap-4 overflow-hidden rounded-card px-6 py-5"
          style={{ boxShadow: `var(--glass-shadow), 0 0 60px -6px ${ficha.acento}aa` }}
        >
          <span className="flex size-11 items-center justify-center rounded-full" style={{ background: ficha.acento }}>
            <Icono size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[20px] font-semibold">{nombre}</span>
            <span className="mt-1 flex -space-x-2" aria-hidden="true">
              {ficha.agentes.map((a) => (
                <Avatar key={a.nombre} name={a.nombre} tone={tono} size={26} />
              ))}
            </span>
          </span>
        </div>
      </div>

      <p className="mb-3 text-tiny font-semibold tracking-[0.18em] text-ink-2 uppercase md:text-center">Departamentos con los que trabaja</p>
      <ul className="grid gap-3 md:grid-cols-3">
        {ficha.departamentos.map((c, k) => {
          const i = nH + k;
          const otro = DEPARTAMENTOS.find((d) => d.tono === c.con);
          const meta = departmentMeta[c.con];
          const IconoOtro = meta.icon;
          return (
            <li key={c.con}>
              <Nodo refNodo={refs[i]} llegadas={llegadas[i]} color={departmentColor[c.con]} sinRelleno>
                <span className={`flex items-center gap-2 px-4 py-3 text-small font-semibold ${meta.header}`}>
                  <IconoOtro size={16} aria-hidden="true" /> {meta.label}
                </span>
                <span className="block px-4 pt-3 pb-4">
                  <span className="block text-small text-white/90">{c.que}</span>
                  {otro && (
                    <Link href={`/departamentos/${otro.slug}`} className="mt-3 inline-flex items-center gap-1.5 text-small font-semibold hover:underline">
                      Ver {otro.nombre} <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  )}
                  <PorRevisar revisar={c.revisar} className="mt-2" />
                </span>
              </Nodo>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Nodo({ refNodo, llegadas, color, sinRelleno, children }: {
  refNodo: RefObject<HTMLDivElement | null>; llegadas: number; color: string; sinRelleno?: boolean; children: React.ReactNode;
}) {
  return (
    <div ref={refNodo} className={`glass relative h-full overflow-hidden rounded-card ${sinRelleno ? "" : "p-4"}`}>
      {children}
      {llegadas > 0 && (
        <span
          key={llegadas}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-card opacity-0 motion-safe:animate-[destello_1.1s_ease-out]"
          style={{ boxShadow: `inset 0 0 0 1.5px ${color}, inset 0 0 28px ${color}55` }}
        />
      )}
    </div>
  );
}
