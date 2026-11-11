import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { GlassPanel } from "@/components/glass";
import { Etiqueta } from "@/components/admin/certificacion/piezas";
import { exigirRolPlataforma } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { equipoSamgple } from "@/lib/admin/clientes/listado";
import { ROLES_IMPLANTACION } from "@/lib/admin/implantacion/config";
import { listarImplantaciones } from "@/lib/admin/implantacion/servicio";

const dia = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "—");
const control = "rounded-pill border border-glass-border bg-black/25 px-3 py-2 text-small text-white";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Page({ searchParams }: PageProps<"/admin/implantacion">) {
  return (
    <Suspense fallback={<p role="status" className="text-body text-ink-2">Cargando implantaciones…</p>}>
      <Listado searchParams={searchParams} />
    </Suspense>
  );
}

async function Listado({ searchParams }: { searchParams: PageProps<"/admin/implantacion">["searchParams"] }) {
  const db = dbAdminDesdeEntorno();
  if (!db || !(await exigirRolPlataforma(ROLES_IMPLANTACION, await headers(), db))) notFound();
  const sp = await searchParams;
  const responsable = typeof sp.responsable === "string" && (UUID.test(sp.responsable) || sp.responsable === "ninguno") ? sp.responsable : "";
  const soloAtrasadas = sp.atrasadas === "1";
  const [todas, equipo] = await Promise.all([listarImplantaciones(db), equipoSamgple(db)]);
  const filas = todas.filter((f) =>
    (!responsable || (responsable === "ninguno" ? !f.responsable : f.responsable?.id === responsable)) && (!soloAtrasadas || f.atrasadas > 0));
  const conRetraso = todas.filter((f) => f.atrasadas > 0).length;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">Implantación</h1>
          <p className="text-body text-ink-2">Clientes en puesta en marcha: progreso, días desde el alta y tareas atrasadas. {conRetraso > 0 && <span className="font-semibold text-status-error">{conRetraso} con retraso.</span>}</p>
        </div>
        <Link href="/admin/implantacion/plantillas" className="glass glass-interactive rounded-pill px-4 py-2 text-small text-white">Plantillas de implantación</Link>
      </header>

      <GlassPanel as="section" aria-label="Filtrar" className="p-4 sm:p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-tiny text-ink-3">Responsable de MyOfia
            <select name="responsable" defaultValue={responsable} className={control}>
              <option value="" className="text-black">Cualquiera</option>
              <option value="ninguno" className="text-black">Sin responsable</option>
              {equipo.map((p) => <option key={p.id} value={p.id} className="text-black">{p.nombre}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-small"><input type="checkbox" name="atrasadas" value="1" defaultChecked={soloAtrasadas} /> Solo con tareas atrasadas</label>
          <button type="submit" className="glass glass-interactive cursor-pointer rounded-pill px-4 py-2 text-small text-white">Filtrar</button>
        </form>
      </GlassPanel>

      {filas.length === 0 ? (
        <GlassPanel className="p-6"><p className="text-small text-ink-2">{todas.length === 0 ? "No hay ningún cliente en implantación." : "Ninguna implantación cumple esos filtros."}</p></GlassPanel>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {filas.map((f) => (
            <li key={f.implantacionId}>
              <GlassPanel as="article" aria-labelledby={`impl-${f.implantacionId}`} className="flex h-full flex-col gap-3 rounded-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 id={`impl-${f.implantacionId}`} className="text-h2"><Link href={`/admin/clientes/${f.companyId}?pestana=implantacion`} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-white">{f.empresa}</Link></h2>
                    <p className="text-tiny text-ink-3">{f.responsable?.nombre ?? "Sin responsable"} · alta hace {f.diasDesdeAlta} {f.diasDesdeAlta === 1 ? "día" : "días"}{f.objetivoFin ? ` · objetivo ${dia(f.objetivoFin)}` : ""}{f.plantilla ? ` · ${f.plantilla}` : " · sin plantilla"}</p>
                  </div>
                  {f.atrasadas > 0
                    ? <Etiqueta tono="mal">{f.atrasadas} atrasada{f.atrasadas === 1 ? "" : "s"}</Etiqueta>
                    : <Etiqueta tono="bien">Al día</Etiqueta>}
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-tiny text-ink-2"><span>{f.hechas} de {f.total} tareas · obligatorias {f.obligatoriasHechas}/{f.obligatorias}</span><span>{f.progreso} %</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={f.progreso} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${f.empresa}`}>
                    <div className={`h-full origin-left rounded-full ${f.atrasadas > 0 ? "bg-status-waiting" : "bg-status-working"}`} style={{ transform: `scaleX(${f.progreso / 100})` }} />
                  </div>
                </div>
                {f.atrasadas > 0 && <p className="text-small font-semibold text-status-error">Atrasadas: {f.atrasadasSamgple} de MyOfia y {f.atrasadasCliente} del cliente.</p>}
                {f.proxima && <p className="text-small text-ink-2">Siguiente: {f.proxima}{f.proximaVence ? <span className={f.proximaVence < new Date().toISOString().slice(0, 10) ? " font-semibold text-status-error" : ""}> · {dia(f.proximaVence)}</span> : null}</p>}
              </GlassPanel>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
