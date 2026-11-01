"use client";

import { useSyncExternalStore } from "react";
import { defaultScene, scenes, type SceneId } from "@/data/scenes";

const KEY = "oficina-escena";
const EVENT = "oficina-escena-change";

function read(): SceneId {
  try {
    const saved = localStorage.getItem(KEY);
    return scenes.some((s) => s.id === saved) ? (saved as SceneId) : defaultScene;
  } catch {
    return defaultScene; // Almacenamiento no disponible (modo privado, etc.)
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setScene(id: SceneId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* se mantiene solo en esta sesión */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Escena elegida, persistida en localStorage. En el servidor devuelve la escena por defecto. */
export function useScene() {
  return useSyncExternalStore(subscribe, read, () => defaultScene);
}
