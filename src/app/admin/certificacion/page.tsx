import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotonTomar } from "@/components/admin/certificacion/BotonTomar";
import { Etiqueta, Seccion, Tabla, TiempoEnCola } from "@/components/admin/certificacion/piezas";
import { sesionRevisor } from "@/lib/admin/certificacion/acceso";
import { CATEGORIAS, NOMBRE_CATEGORIA, NOMBRE_ESTADO, NOMBRE_TIPO, NOMBRE_VIA } from "@/lib/admin/certificacion/config";
import { listarCola, type FilaCola } from "@/lib/admin/certificacion/servicio";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";

const rutaDe = (f: FilaCola) => (f.clase === "agente" ? `/admin/certificacion/${f.id}` : `/admin/certificacion/plantillas/${f.id}`);
const COLS = [{ t: "Agente" }, { t: "Empresa" }, { t: "Departamento" }, { t: "Tipo" }, { t: "Vía" }, { t: "Estado" }, { t: "Esperando" }, { t: "", der: true }];
const selectCls = "glass cursor-pointer rounded-pill bg-transparent px-3 py-2 text-small text-white";

function Fila({ f, accion }: { f: FilaCola; accion: React.ReactNode }) {
  return (
    <tr>
      <td><Link href={rutaDe(f)} className="font-semibold underline-offset-4 hover:underline focus-visible:underline">{f.nombre}</Link><span className="block text-tiny text-ink-3">versión {f.version}</span></td>
      <td className="text-ink-2">{f.empresa ?? "Plantilla de SAMGPLE"}</td>
      <td>{NOMBRE_CATEGORIA[f.departamento] ?? f.departamento}</td>
      <td>{NOMBRE_TIPO[f.tipo] ?? f.tipo}</td>
      <td>{NOMBRE_VIA[f.via] ?? f.via}</td>
      <td>
        <Etiqueta tono={f.estado === "segunda_opinion" ? "aviso" : f.estado === "en_revision" ? "acento" : "neutro"}>{NOMBRE_ESTADO[f.estado] ?? f.estado}</Etiqueta>
        {f.desacuerdo && <span className="mt-1 block text-tiny text-status-error">Opiniones distintas: decide un admin</span>}
        {f.asignadoNombre && <span className="mt-1 block text-tiny text-ink-3">{f.asignadoNombre}</span>}
      </td>
      <td><TiempoEnCola espera={f.espera} /></td>
      <td className="text-right">{accion}</td>
    </tr>
  );
}

export default function Page({ searchParams }: PageProps<"/admin/certificacion">) {
  return <Suspense fallback={<p role="status" className="text-body text-ink-2">Cargando la cola…</p>}><Cola searchParams={searchParams} /></Suspense>;
}

async function Cola({ searchParams }: { searchParams: PageProps<"/admin/certificacion">["searchParams"] }) {
  const db = dbAdminDesdeEntorno();
  const sesion = db ? await sesionRevisor(await headers(), db) : null;
  if (!db || !sesion) notFound();   // quien no es del equipo revisor ve un 404: el panel no existe para él
  const q = await searchParams;
  const uno = (k: string) => (typeof q[k] === "string" && q[k] ? (q[k] as string) : undefined);
  const filtros = { tipo: uno("tipo"), via: uno("via"), departamento: uno("departamento"), empresa: uno("empresa") };
  const cola = await listarCola(db, sesion, filtros);
  const fuera = cola.enCola.filter((f) => f.espera.fueraDePlazo).length;

  return (
    <>
      <header>
        <h1 className="text-h1">Certificación de agentes</h1>
        <p className="text-body text-ink-2">Panel interno de SAMGPLE. Aquí se ve la configuración enviada y el examen (hecho con datos ficticios); nunca correos, contactos ni memoria de las empresas.</p>
      </header>

      {cola.mias.length > 0 && (
        <Seccion id="mias" titulo={`Tus revisiones (${cola.mias.length})`} nota="Solicitudes que tienes asignadas ahora.">
          <Tabla caption="Solicitudes asignadas a ti" cols={COLS}>
            {cola.mias.map((f) => <Fila key={f.id} f={f} accion={<Link href={rutaDe(f)} className="glass glass-interactive inline-block rounded-pill px-4 py-2 text-small">Continuar</Link>} />)}
          </Tabla>
        </Seccion>
      )}

      <Seccion id="cola" titulo={`Cola de revisión (${cola.enCola.length})`}
        nota={`Pendientes de revisión y de segunda opinión, de la más antigua a la más reciente. Plazo objetivo: ${cola.plazos.completa} h laborables la vía completa y ${cola.plazos.rapida_plantilla} h la rápida (de lunes a viernes).${fuera ? ` ${fuera} fuera de plazo.` : ""}`}>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-tiny text-ink-2">Tipo
            <select name="tipo" defaultValue={filtros.tipo ?? ""} className={selectCls}>
              <option value="" className="text-black">Todos</option>
              {["nueva", "cambio_importante", "periodica", "plantilla", "nueva_version"].map((t) => <option key={t} value={t} className="text-black">{NOMBRE_TIPO[t]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-tiny text-ink-2">Vía
            <select name="via" defaultValue={filtros.via ?? ""} className={selectCls}>
              <option value="" className="text-black">Todas</option>
              <option value="rapida_plantilla" className="text-black">Rápida</option>
              <option value="completa" className="text-black">Completa</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-tiny text-ink-2">Departamento
            <select name="departamento" defaultValue={filtros.departamento ?? ""} className={selectCls}>
              <option value="" className="text-black">Todos</option>
              {CATEGORIAS.map((c) => <option key={c} value={c} className="text-black">{NOMBRE_CATEGORIA[c]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-tiny text-ink-2">Empresa
            <select name="empresa" defaultValue={filtros.empresa ?? ""} className={selectCls}>
              <option value="" className="text-black">Todas</option>
              <option value="plantillas" className="text-black">Plantillas de SAMGPLE</option>
              {cola.empresas.map((e) => <option key={e.id} value={e.id} className="text-black">{e.nombre}</option>)}
            </select>
          </label>
          <button type="submit" className="glass glass-interactive cursor-pointer rounded-pill px-4 py-2 text-small text-white">Filtrar</button>
          <Link href="/admin/certificacion" className="px-2 py-2 text-small text-ink-2 underline-offset-4 hover:underline">Quitar filtros</Link>
        </form>
        <Tabla caption="Cola de revisión" cols={COLS} vacio={cola.enCola.length === 0} textoVacio="No hay solicitudes esperando con estos filtros.">
          {cola.enCola.map((f) => (
            <Fila key={f.id} f={f} accion={f.puedeCoger
              ? <BotonTomar solicitud={{ clase: f.clase, id: f.id }} etiqueta={f.estado === "segunda_opinion" ? "Dar segunda opinión" : "Coger"} />
              : <span className="inline-block max-w-48 text-tiny text-ink-3">{f.motivoNoCoger}</span>} />
          ))}
        </Tabla>
      </Seccion>

      {cola.asignadas.length > 0 && (
        <Seccion id="asignadas" titulo={`En revisión por el equipo (${cola.asignadas.length})`}>
          <Tabla caption="Solicitudes asignadas a otras personas" cols={COLS}>
            {cola.asignadas.map((f) => <Fila key={f.id} f={f} accion={<Link href={rutaDe(f)} className="text-small underline-offset-4 hover:underline">Ver</Link>} />)}
          </Tabla>
        </Seccion>
      )}
    </>
  );
}
