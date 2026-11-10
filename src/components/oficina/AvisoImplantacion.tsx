import { CircleCheck, Circle, Wrench } from "lucide-react";
import { headers } from "next/headers";
import { GlassPanel } from "@/components/glass";
import { empresaPedida, sesionEnEmpresa } from "@/lib/empresas/sesion";
import { supabaseAdmin, usuarioActual } from "@/lib/supabase/server";

const dia = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long" }) : null);

/**
 * «Estamos preparando tu oficina»: mientras la empresa de la sesión tiene la implantación en curso, su progreso,
 * lo que le toca hacer al cliente y quién es su responsable en SAMGPLE. La empresa sale SIEMPRE de la sesión
 * (verificada contra sus pertenencias); nunca de un parámetro.
 */
export async function AvisoImplantacion() {
  const persona = await usuarioActual();
  if (!persona) return null;
  const db = supabaseAdmin();
  const sesion = await sesionEnEmpresa(db, persona.id, empresaPedida(await headers()));
  if (!sesion) return null;

  const { data: impl } = await db.from("implantaciones").select("id, responsable, objetivo_fin").eq("company_id", sesion.companyId).eq("estado", "en_curso").maybeSingle();
  if (!impl) return null;
  const [{ data: tareas }, { data: resp }] = await Promise.all([
    db.from("implantacion_tareas").select("id, titulo, para, ayuda, vence_en, hecha_en, orden").eq("implantacion_id", impl.id).order("orden"),
    impl.responsable ? db.from("platform_roles").select("nombre").eq("user_id", impl.responsable).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const todas = tareas ?? [];
  const hechas = todas.filter((t) => t.hecha_en).length;
  const pct = todas.length ? Math.round((hechas / todas.length) * 100) : 0;
  const tuyas = todas.filter((t) => t.para === "cliente");

  return (
    <GlassPanel as="section" aria-labelledby="impl-t" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="impl-t" className="flex items-center gap-2 text-h2"><Wrench size={20} aria-hidden="true" /> Estamos preparando tu oficina</h2>
          <p className="mt-1 text-small text-ink-2">
            Configuramos tus departamentos y agentes, los probamos contigo y los certificamos antes de que trabajen con clientes reales.
            {resp?.nombre ? ` Tu responsable en SAMGPLE es ${resp.nombre as string}.` : ""}
            {impl.objetivo_fin ? ` Objetivo: ${dia(impl.objetivo_fin as string)}.` : ""}
          </p>
        </div>
        <p className="text-small text-ink-2"><span className="text-h2 text-white">{pct} %</span> · {hechas} de {todas.length} pasos</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de la puesta en marcha">
        <div className="h-full origin-left rounded-full bg-status-working" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      {tuyas.length > 0 && (
        <div>
          <h3 className="text-small font-semibold">Lo que te toca a ti</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {tuyas.map((t) => (
              <li key={t.id as string} className={`flex gap-3 rounded-card bg-black/20 p-3 text-small ${t.hecha_en ? "text-ink-3" : ""}`}>
                {t.hecha_en ? <CircleCheck size={17} aria-label="Hecho" className="mt-0.5 shrink-0 text-status-working" /> : <Circle size={17} aria-label="Pendiente" className="mt-0.5 shrink-0 text-ink-2" />}
                <span>
                  <span className={t.hecha_en ? "line-through" : ""}>{t.titulo as string}</span>
                  {!t.hecha_en && (t.ayuda || t.vence_en) && <span className="block text-tiny text-ink-3">{[t.ayuda as string | null, t.vence_en ? `Antes del ${dia(t.vence_en as string)}` : null].filter(Boolean).join(" · ")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassPanel>
  );
}
