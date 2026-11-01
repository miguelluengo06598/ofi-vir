"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { departmentMeta, enterMotion, type DepartmentId } from "./tokens";

type Props = {
  department: DepartmentId;
  title: string;
  description: string;
  tag?: string;
  actions?: ReactNode;
  /** Para abrir la tarjeta como panel con layoutId. */
  layoutId?: string;
  /** Fuerza el aspecto de hover (para revisión visual). */
  hovered?: boolean;
  className?: string;
};

export function GlassCard({
  department,
  title,
  description,
  tag,
  actions,
  layoutId,
  hovered,
  className = "",
}: Props) {
  const meta = departmentMeta[department];
  return (
    <motion.article
      layoutId={layoutId}
      initial={enterMotion.initial}
      animate={{ ...enterMotion.animate, y: hovered ? -4 : 0 }}
      whileHover={{ y: -4 }}
      transition={enterMotion.transition}
      className={`glass glass-interactive overflow-hidden rounded-card text-white ${hovered ? "is-hover" : ""} ${className}`}
    >
      <div className={`flex items-center justify-between px-4 py-3 ${meta.header}`}>
        <span className="text-small font-semibold">{meta.label}</span>
        {tag && (
          <span className="rounded-pill bg-black/25 px-2 py-0.5 text-tiny text-white">{tag}</span>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <h3 className="text-h2">{title}</h3>
        <p className="text-small text-ink-2">{description}</p>
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </motion.article>
  );
}
