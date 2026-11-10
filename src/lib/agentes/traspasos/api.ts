/**
 * GET /api/traspasos — cadenas de traspasos REALES de la empresa de la sesión, con la forma que ya usa la interfaz
 * (`Chain` / `Handoff` de `src/data/handoffs.ts`) para alimentar «En directo» y las líneas de luz. La empresa sale siempre
 * de la sesión. Solo lectura. Parámetros: `?limite=` (cadenas, 1-50, por defecto 20).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Sesion } from "../../creditos/api.ts";
import { fichaParaMostrar, esTipoDeTraspaso } from "./fichas.ts";

export type DepsTraspasosApi = { db: SupabaseClient; autenticar: (req: Request) => Promise<Sesion | null>; log?: Pick<Console, "error"> };

const ESTADO_UI: Record<string, string> = { sent: "sent", received: "received", in_progress: "inProgress", done: "done", rejected: "rejected" };
const Query = z.object({ limite: z.coerce.number().int().min(1).max(50).default(20) }).strict();
const json = (c: unknown, status = 200) => Response.json(c, { status, headers: { "cache-control": "no-store" } });

type FilaTraspaso = {
  id: string; chain_id: string; position: number; from_agent_id: string; to_agent_id: string; from_department_id: string; to_department_id: string;
  kind: string; summary: string; bubble: string | null; card: { label: string; value: string }[]; status: string; credits: number | string;
  occurred_at: string; tipo_traspaso: string | null; ficha: Record<string, string | number> | null;
};

export async function traspasosHandler(req: Request, deps: DepsTraspasosApi): Promise<Response> {
  const sesion = await deps.autenticar(req);
  if (!sesion) return json({ error: "no_autenticado", mensaje: "Inicia sesión para continuar." }, 401);
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return json({ error: "parametros_invalidos", mensaje: "Parámetros no válidos." }, 400);
  const { companyId } = sesion;
  try {
    const { data: cadenas, error } = await deps.db.from("handoff_chains").select("id, title, goal, estado, motivo_corte, created_at")
      .eq("company_id", companyId).order("created_at", { ascending: false }).limit(q.data.limite);
    if (error) throw new Error(error.message);
    const ids = (cadenas ?? []).map((c) => c.id as string);
    if (ids.length === 0) return json({ origen: "real", cadenas: [] });
    const [{ data: tr, error: e2 }, { data: ags }, { data: deps_ }] = await Promise.all([
      deps.db.from("handoffs").select("id, chain_id, position, from_agent_id, to_agent_id, from_department_id, to_department_id, kind, summary, bubble, card, status, credits, occurred_at, tipo_traspaso, ficha")
        .eq("company_id", companyId).in("chain_id", ids).order("position", { ascending: true }),
      deps.db.from("agents").select("id, slug").eq("company_id", companyId),
      deps.db.from("departments").select("id, slug").eq("company_id", companyId),
    ]);
    if (e2) throw new Error(e2.message);
    const agente = new Map((ags ?? []).map((a) => [a.id as string, a.slug as string]));
    const dpto = new Map((deps_ ?? []).map((d) => [d.id as string, d.slug as string]));
    const porCadena = new Map<string, FilaTraspaso[]>();
    for (const t of (tr ?? []) as FilaTraspaso[]) porCadena.set(t.chain_id, [...(porCadena.get(t.chain_id) ?? []), t]);
    return json({
      origen: "real",
      cadenas: (cadenas ?? []).map((c) => {
        const hs = porCadena.get(c.id as string) ?? [];
        return {
          id: c.id, title: c.title, goal: c.goal, estado: c.estado, motivoCorte: c.motivo_corte,
          costeTotal: hs.reduce((n, h) => n + Number(h.credits), 0),
          handoffs: hs.map((h) => ({
            id: h.id, chainId: h.chain_id, fromAgentId: agente.get(h.from_agent_id) ?? h.from_agent_id, toAgentId: agente.get(h.to_agent_id) ?? h.to_agent_id,
            fromDepartmentId: dpto.get(h.from_department_id) ?? h.from_department_id, toDepartmentId: dpto.get(h.to_department_id) ?? h.to_department_id,
            kind: h.kind, tipoTraspaso: h.tipo_traspaso, summary: h.summary, bubble: h.bubble ?? h.summary,
            card: h.tipo_traspaso && esTipoDeTraspaso(h.tipo_traspaso) && h.ficha ? fichaParaMostrar(h.tipo_traspaso, h.ficha) : h.card,
            status: ESTADO_UI[h.status] ?? h.status, time: h.occurred_at, credits: Number(h.credits),
          })),
        };
      }),
    });
  } catch (e) {
    (deps.log ?? console).error("[api/traspasos]", e instanceof Error ? e.message : "error");
    return json({ error: "error_interno", mensaje: "No se pudieron leer los traspasos." }, 500);
  }
}
