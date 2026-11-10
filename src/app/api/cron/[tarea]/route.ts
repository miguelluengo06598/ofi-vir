import { z } from "zod";
import { autorizarCron, depsDesdeEntorno, esProduccion } from "@/lib/creditos/cronEntorno";
import { ejecutarTareaPeriodica, TAREAS_PERIODICAS } from "@/lib/creditos/tareasPeriodicas";

/**
 * Tareas periódicas de créditos. GET o POST /api/cron/<tarea> con `Authorization: Bearer $CRON_SECRET`.
 * Tareas: caducar-creditos, revisar-estados, renovar-bonos, recertificacion, control-calidad, rutinas, renovar-conexiones, abrir-aplazadas, procesar-traspasos, examenes-certificacion. Fuera de producción admite `?ahora=<fecha ISO>`
 * para simular el paso del tiempo.
 */
async function manejar(req: Request, ctx: { params: Promise<{ tarea: string }> }) {
  const auth = autorizarCron(req.headers.get("authorization"));
  if (!auth.ok) return Response.json({ error: auth.motivo }, { status: auth.status });

  const tarea = z.enum(TAREAS_PERIODICAS).safeParse((await ctx.params).tarea);
  if (!tarea.success) return Response.json({ error: "Tarea desconocida.", tareas: TAREAS_PERIODICAS }, { status: 404 });

  const ahoraParam = new URL(req.url).searchParams.get("ahora");
  let ahora = new Date();
  if (ahoraParam) {
    if (esProduccion()) return Response.json({ error: "`ahora` no se admite en producción." }, { status: 400 });
    const f = z.coerce.date().safeParse(ahoraParam);
    if (!f.success) return Response.json({ error: "`ahora` no es una fecha válida." }, { status: 400 });
    ahora = f.data;
  }

  try {
    const resultado = await ejecutarTareaPeriodica(tarea.data, depsDesdeEntorno(ahora));
    return Response.json({ tarea: tarea.data, ahora: ahora.toISOString(), resultado });
  } catch (e) {
    console.error(`cron ${tarea.data}:`, e instanceof Error ? e.message : "error desconocido");
    return Response.json({ error: "La tarea falló. Revisa el registro del servidor." }, { status: 500 });
  }
}

export const GET = manejar;
export const POST = manejar;
