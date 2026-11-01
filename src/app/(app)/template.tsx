"use client";

import { motion } from "framer-motion";
import { enterMotion } from "@/components/glass";

/** Se vuelve a montar en cada navegación: la vista entra con fade + desplazamiento + blur. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={enterMotion.initial}
      animate={enterMotion.animate}
      transition={enterMotion.transition}
    >
      {children}
    </motion.div>
  );
}
