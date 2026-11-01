"use client";

import { motion } from "framer-motion";
import { GlassPanel } from "./GlassPanel";

/** GlassPanel animable (layoutId, initial/animate…). */
export const MotionGlassPanel = motion.create(GlassPanel);
