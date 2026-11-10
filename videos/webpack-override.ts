/**
 * Ajustes de webpack compartidos por remotion.config.ts (Studio y CLI) y scripts/renderizar.ts.
 *  - «@/…» apunta a ../src, como en la app.
 *  - React se fuerza a la copia de esta carpeta: una sola instancia aunque el componente venga de ../src.
 *  - Tailwind v4 con la misma configuración y los mismos estilos de cristal que la app.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enableTailwind } from "@remotion/tailwind-v4";
import type { WebpackOverrideFn } from "@remotion/bundler";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const modulo = (nombre: string) => path.join(aqui, "node_modules", nombre);

export const ajustarWebpack: WebpackOverrideFn = (actual) => {
  const conTailwind = enableTailwind(actual);
  return {
    ...conTailwind,
    resolve: {
      ...conTailwind.resolve,
      alias: {
        ...(conTailwind.resolve?.alias ?? {}),
        "@": path.join(aqui, "..", "src"),
        react: modulo("react"),
        "react-dom": modulo("react-dom"),
        "react/jsx-runtime": modulo("react/jsx-runtime.js"),
        "react/jsx-dev-runtime": modulo("react/jsx-dev-runtime.js"),
      },
    },
  };
};
