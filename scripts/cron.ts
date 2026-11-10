/**
 * Lanza a mano las tareas periódicas de créditos contra la base local.
 *   npm run cron -- caducar-creditos
 *   npm run cron -- todas --ahora=2027-01-10T08:00:00Z     (simula otra fecha)
 */
import { depsDesdeEntorno } from "../src/lib/creditos/cronEntorno.ts";
import { ejecutarTareaPeriodica, TAREAS_PERIODICAS, type TareaPeriodica } from "../src/lib/creditos/tareasPeriodicas.ts";

const args = process.argv.slice(2);
const nombre = args.find((a) => !a.startsWith("--"));
const ahoraArg = args.find((a) => a.startsWith("--ahora="))?.slice(8);
const tareas: TareaPeriodica[] | null =
  nombre === "todas" ? [...TAREAS_PERIODICAS] : (TAREAS_PERIODICAS as readonly string[]).includes(nombre ?? "") ? [nombre as TareaPeriodica] : null;

if (!tareas) {
  console.error(`Uso: npm run cron -- <${[...TAREAS_PERIODICAS, "todas"].join("|")}> [--ahora=<fecha ISO>]`);
  process.exit(1);
}
const ahora = ahoraArg ? new Date(ahoraArg) : new Date();
if (Number.isNaN(ahora.getTime())) {
  console.error(`--ahora no es una fecha válida: ${ahoraArg}`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Este script es para desarrollo local.");
  process.exit(1);
}

const deps = depsDesdeEntorno(ahora);
console.log(`Fecha: ${ahora.toISOString()} · local: ${deps.esLocal ? "sí" : "no"}`);
for (const t of tareas) {
  console.log(`\n→ ${t}`);
  console.log(JSON.stringify(await ejecutarTareaPeriodica(t, deps), null, 2));
}
