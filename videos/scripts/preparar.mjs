// Copia las fotos de la escena de la app (../public/scenes) a public/scenes, que es lo que lee Remotion.
// Así no se duplican en git y Remotion no copia todo ../public (incluidos los vídeos ya renderizados).
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
mkdirSync(path.join(raiz, "public"), { recursive: true });
cpSync(path.join(raiz, "..", "public", "scenes"), path.join(raiz, "public", "scenes"), { recursive: true });
console.log("Escenas copiadas a videos/public/scenes");
