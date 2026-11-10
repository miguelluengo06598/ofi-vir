import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotonSoltar, BotonTomar } from "@/components/admin/certificacion/BotonTomar";
import { PanelDecision } from "@/components/admin/certificacion/PanelDecision";
import { Bloque, Dato, Etiqueta, RevisionesHechas, Seccion, Tabla, TiempoEnCola } from "@/components/admin/certificacion/piezas";
import { sesionRevisor } from "@/lib/admin/certificacion/acceso";
import { NOMBRE_CATEGORIA, NOMBRE_ESTADO, NOMBRE_TIPO } from "@/lib/admin/certificacion/config";
import { detalleDePlantilla } from "@/lib/admin/certificacion/servicio";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

const PERMISO: Record<string, string> = { sola: "Sin aprobación", aprobacion: "Con aprobación", humano: "Pasa a una persona", prohibida: "Prohibida" };

export default function Page({ params }: PageProps<"/admin/certificacion/plantillas/[id]">) {
  return <Suspense fallback={<p role="status" className="text-body text-ink-2">Cargando la plantilla…</p>}><Revision params={params} /></Suspense>;
}

async function Revision({ params }: { params: PageProps<"/admin/certificacion/plantillas/[id]">["params"] }) {
  const db = dbAdminDesdeEntorno();
  const sesion = db ? await sesionRevisor(await headers(), db) : null;
  if (!db || !sesion) notFound();
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await detalleDePlantilla(db, sesion, id) : null;
  if (!d) notFound();
  const p = d.plantilla;
  const ref = { clase: "plantilla" as const, id: d.id };
  const cerrada = ["aprobada", "rechazada", "cambios_solicitados", "cancelada"].includes(d.estado);
  const esSegunda = d.estado === "segunda_opinion";

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-small text-ink-2"><Link href="/admin/certificacion" className="underline-offset-4 hover:underline">Cola de revisión</Link> / Plantillas de SAMGPLE</p>
          <h1 className="text-h1">Plantilla {p.nombre} <span className="text-ink-2">· versión {d.version}</span></h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-small">
            <Etiqueta tono={d.estado === "aprobada" ? "bien" : d.estado === "rechazada" ? "mal" : esSegunda ? "aviso" : "acento"}>{NOMBRE_ESTADO[d.estado] ?? d.estado}</Etiqueta>
            <Etiqueta>{NOMBRE_TIPO[d.tipo] ?? d.tipo}</Etiqueta>
            <Etiqueta>{NOMBRE_CATEGORIA[p.categoria] ?? p.categoria}</Etiqueta>
            <Etiqueta>{d.agentesQueLaUsan} agentes la usan</Etiqueta>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right text-small">
          {!cerrada && <div><span className="text-tiny text-ink-3">En cola</span><TiempoEnCola espera={d.espera} /></div>}
          {d.esMia ? <BotonSoltar solicitud={ref} />
            : d.puedeCoger ? <BotonTomar solicitud={ref} abrir={false} etiqueta={esSegunda ? "Dar segunda opinión" : "Coger esta solicitud"} />
            : d.asignadoNombre ? <p className="text-ink-2">La revisa {d.asignadoNombre}</p>
            : !cerrada && <p className="max-w-64 text-ink-2">{d.motivoNoCoger}</p>}
        </div>
      </header>

      {d.revisiones.length > 0 && <Seccion id="revisiones" titulo="Revisiones ya hechas" nota={d.desacuerdo ? "Las dos opiniones no coinciden: la cierra un administrador." : undefined}><RevisionesHechas revisiones={d.revisiones} /></Seccion>}

      <Seccion id="plantilla" titulo="1. La plantilla" nota="Hasta que esta versión esté certificada no se puede usar para crear agentes ni se ofrece a los que ya usan una anterior.">
        <dl className="grid gap-4 md:grid-cols-2">
          <Dato t="Rol">{p.rol}</Dato>
          <Dato t="Tipo de tarea por defecto">{p.tipoTarea}</Dato>
          <Dato t="Descripción pública">{p.descripcion}</Dato>
          <Dato t="Integraciones que requiere">{p.integraciones.join(", ") || "Ninguna"}</Dato>
          <Dato t="Qué hace">{p.queHace}</Dato>
          <Dato t="Qué no hace">{p.queNoHace}</Dato>
        </dl>
        {p.novedades && <p className="text-small"><span className="text-ink-3">Novedades de esta versión: </span>{p.novedades}</p>}
        <div>
          <h3 className="mb-2 text-small text-ink-2">Instrucciones base</h3>
          <Bloque>{p.instruccionesBase}</Bloque>
        </div>
      </Seccion>

      <Seccion id="herramientas" titulo="2. Herramientas y permisos por defecto" nota={d.cambiosDeHerramientas ? (d.cambiosDeHerramientas.length ? `Respecto a la versión anterior: ${d.cambiosDeHerramientas.join(" ")}` : "Mismas herramientas que la versión anterior.") : "Primera versión de la plantilla."}>
        <Tabla caption="Herramientas de la plantilla" cols={[{ t: "Herramienta" }, { t: "Permiso por defecto" }, { t: "¿Puede cambiarlo la empresa?" }]}>
          {p.herramientas.map((h) => (
            <tr key={h.id}><td className="font-semibold">{h.id}</td><td><Etiqueta tono={h.permiso_defecto === "sola" ? "aviso" : "bien"}>{PERMISO[h.permiso_defecto] ?? h.permiso_defecto}</Etiqueta></td><td>{h.editable ? "Sí" : "No"}</td></tr>
          ))}
        </Tabla>
      </Seccion>

      <Seccion id="decision" titulo="3. Lista de comprobación y decisión">
        {d.esMia ? <PanelDecision solicitud={ref} esSegundaOpinion={esSegunda} motivosSegundaOpinion={[]} siempreSegunda />
          : cerrada ? <p className="text-small text-ink-2">Solicitud cerrada: {(NOMBRE_ESTADO[d.estado] ?? d.estado).toLowerCase()}.</p>
          : <p className="text-small text-ink-2">{d.puedeCoger ? "Coge la solicitud para poder decidir." : d.asignadoNombre ? `La está revisando ${d.asignadoNombre}.` : d.motivoNoCoger}</p>}
      </Seccion>
    </>
  );
}
