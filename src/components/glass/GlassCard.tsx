"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { departmentMeta, enterMotion, type DepartmentId } from "./tokens";

type Props = {
  department: DepartmentId;
  /** Título opcional bajo la cabecera (la cabecera ya muestra el nombre del departamento). */
  title?: string;
  description?: string;
  tag?: string;
  /** Sustituye al icono del departamento en la cabecera. */
  icon?: LucideIcon;
  /** Contenido libre entre la descripción y las acciones. */
  children?: ReactNode;
  actions?: ReactNode;
  /** Pie con separador. */
  footer?: ReactNode;
  /** Para abrir la tarjeta como panel con layoutId. */
  layoutId?: string;
  /** Retraso de la animación de entrada (s), para escalonar tarjetas. */
  delay?: number;
  /** Fuerza el aspecto de hover (para revisión visual). */
  hovered?: boolean;
  className?: string;
};

export function GlassCard({
  department,
  title,
  description,
  tag,
  icon,
  children,
  actions,
  footer,
  layoutId,
  delay = 0,
  hovered,
  className = "",
}: Props) {
  const meta = departmentMeta[department];
  const Icon = icon ?? meta.icon;
  return (
    <motion.article
      layout
      layoutId={layoutId}
      initial={enterMotion.initial}
      animate={{ ...enterMotion.animate, y: hovered ? -4 : 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
      whileHover={{ y: -4, transition: { duration: 0.2, delay: 0 } }}
      transition={{ ...enterMotion.transition, delay }}
      className={`glass glass-interactive flex flex-col overflow-hidden rounded-card text-white ${hovered ? "is-hover" : ""} ${className}`}
    >
      <div className={`flex items-center justify-between gap-2 px-4 py-3 ${meta.header}`}>
        <h3 className="flex items-center gap-2 text-small font-semibold">
          <Icon size={16} aria-hidden="true" />
          {meta.label}
        </h3>
        {tag && (
          <span className="rounded-pill bg-black/25 px-2 py-0.5 text-tiny text-white">{tag}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {title && <p className="text-h2">{title}</p>}
        {description && <p className="text-small text-ink-2">{description}</p>}
        {children}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
      {footer && (
        <div className="border-t border-glass-border px-4 py-3 text-tiny text-ink-2">{footer}</div>
      )}
    </motion.article>
  );
}
