import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GlassPanel } from "@/components/glass";
import { Seccion, Tabla } from "@/components/admin/certificacion/piezas";
import { sesionRevisor } from "@/lib/admin/certificacion/acceso";
import { metricasDelEquipo } from "@/lib/admin/certificacion/servicio";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`);
const semana = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });

export default function Page() {
  return <Suspense fallback={<p role="status" className="text-body text-ink-2">Calculando las métricas…</p>}><Metricas /></Suspense>;
}

async function Metricas() {
  const db = dbAdminDesdeEntorno();
  const sesion = db ? await sesionRevisor(await headers(), db) : null;
  if (!db || !sesion) notFound();
  const m = await metricasDelEquipo(db);
  const max = Math.max(1, ...m.semanas.map((s) => Math.max(s.recibidas, s.resueltas)));
  const tarjetas = [
    { t: "Solicitudes resueltas", v: String(m.resueltas), s: `${m.aprobadas} aprobadas · ${m.cambiosSolicitados} con cambios pedidos · ${m.rechazadas} rechazadas` },
    { t: "Aprobaciones", v: pct(m.porcentajeAprobaciones), s: "De las solicitudes resueltas" },
    { t: "Tiempo medio de revisión", v: m.tiempoMedioHoras === null ? "—" : `${m.tiempoMedioHoras.toLocaleString("es-ES")} h`, s: "Horas laborables desde que entra en la cola hasta que se cierra" },
    { t: "Dentro de plazo", v: pct(m.dentroDePlazo), s: "Resueltas dentro del plazo objetivo de su vía" },
  ];
  return (
    <>
      <header>
        <h1 className="text-h1">Métricas del equipo</h1>
        <p className="text-body text-ink-2">Últimas {m.semanas.length} semanas. Solo cuentan las solicitudes que pasan por revisión humana.</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((x) => (
          <li key={x.t}><GlassPanel className="flex h-full flex-col gap-1 rounded-card p-4"><p className="text-small text-ink-2">{x.t}</p><p className="text-h2">{x.v}</p><p className="text-tiny text-ink-3">{x.s}</p></GlassPanel></li>
        ))}
      </ul>

      <Seccion id="semanas" titulo="Solicitudes por semana" nota="Recibidas en la cola de revisión y resueltas, por semana (empieza el lunes).">
        <Tabla caption="Solicitudes recibidas y resueltas por semana" cols={[{ t: "Semana del" }, { t: "Recibidas" }, { t: "Resueltas" }]}>
          {m.semanas.map((s) => (
            <tr key={s.semana}>
              <td className="whitespace-nowrap">{semana(s.semana)}</td>
              {[s.recibidas, s.resueltas].map((n, i) => (
                <td key={i}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`block h-2 rounded-pill ${i === 0 ? "bg-accent" : "bg-status-working"}`} style={{ width: `${(n / max) * 12}rem`, minWidth: n ? "0.25rem" : 0 }} />
                    <span>{n}</span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </Tabla>
      </Seccion>

      <Seccion id="motivos" titulo="Motivos de rechazo más frecuentes" nota="Puntos de la lista de comprobación marcados como «no cumple» en las revisiones que no aprobaron.">
        <Tabla caption="Motivos de rechazo" cols={[{ t: "Punto de la lista" }, { t: "Veces", der: true }]} vacio={m.motivosDeRechazo.length === 0} textoVacio="Todavía no hay rechazos ni cambios pedidos en este periodo.">
          {m.motivosDeRechazo.map((x) => <tr key={x.id}><td>{x.titulo}</td><td className="text-right">{x.veces}</td></tr>)}
        </Tabla>
      </Seccion>

      <Seccion id="revisores" titulo="Revisiones por persona">
        <Tabla caption="Revisiones hechas por cada persona" cols={[{ t: "Persona" }, { t: "Revisiones", der: true }]} vacio={m.porRevisor.length === 0} textoVacio="Sin revisiones en este periodo.">
          {m.porRevisor.map((x) => <tr key={x.nombre}><td>{x.nombre}</td><td className="text-right">{x.revisiones}</td></tr>)}
        </Tabla>
      </Seccion>
    </>
  );
}
