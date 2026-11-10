/**
 * Copia las plantillas de src/lib/agentes/plantillas/ a la tabla agent_templates.
 *   npm run plantillas:sync                       crea o actualiza (sube la versión si cambió el contenido)
 *   npm run plantillas:sync -- --simular          muestra qué haría sin escribir
 *   npm run plantillas:sync -- --datos-de-prueba  además, SOLO EN LOCAL: certificación de prueba + enlaza los agentes del seed
 */
import { createClient } from "@supabase/supabase-js";
import { PLANTILLAS } from "../src/lib/agentes/plantillas/index.ts";
import { aplicarDatosDePrueba, sincronizarPlantillas } from "../src/lib/agentes/plantillas/sincronizar.ts";
import { aplicarDatosDeRevision } from "../src/lib/admin/certificacion/datosDePrueba.ts";

const args = new Set(process.argv.slice(2));
const simular = args.has("--simular");
const datosDePrueba = args.has("--datos-de-prueba");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (usa .env.local).");
  process.exit(1);
}
const esLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
if (datosDePrueba && (!esLocal || process.env.NODE_ENV === "production")) {
  console.error("--datos-de-prueba solo se puede usar contra la base local.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const resultados = await sincronizarPlantillas(db, PLANTILLAS, { simular });
for (const r of resultados) console.log(`${simular ? "[simulación] " : ""}${r.id.padEnd(16)} ${r.accion.padEnd(12)} v${r.version}${r.accion === "sin_cambios" ? "" : "  (pendiente de certificar)"}`);

if (datosDePrueba && !simular) {
  const r = await aplicarDatosDePrueba(db, PLANTILLAS);
  console.log(`Certificaciones de PRUEBA añadidas: ${r.certificadas.join(", ") || "ninguna (ya había)"}`);
  console.log(`Agentes del seed enlazados: ${r.enlazados.join(", ") || "ninguno (ya estaban)"}`);
  console.log(`Agentes del seed certificados y activados (PRUEBA): ${r.agentesActivados.join(", ") || "ninguno (ya estaban)"}`);
  const revision = await aplicarDatosDeRevision(db);
  console.log(`Solicitudes de certificación de PRUEBA (/admin/certificacion):${revision.length ? `\n  - ${revision.join("\n  - ")}` : " ninguna nueva (ya estaban, o falta el seed)"}`);
}
