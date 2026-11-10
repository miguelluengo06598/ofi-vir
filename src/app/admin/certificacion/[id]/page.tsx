import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotonSoltar, BotonTomar } from "@/components/admin/certificacion/BotonTomar";
import { PanelDecision } from "@/components/admin/certificacion/PanelDecision";
import { Bloque, Dato, Etiqueta, RevisionesHechas, Seccion, Tabla, TiempoEnCola } from "@/components/admin/certificacion/piezas";
import { SimuladorRevisor } from "@/components/admin/certificacion/SimuladorRevisor";
import { sesionRevisor } from "@/lib/admin/certificacion/acceso";
import { NOMBRE_CATEGORIA, NOMBRE_ESTADO, NOMBRE_TIPO, NOMBRE_VIA } from "@/lib/admin/certificacion/config";
import { detalleDeSolicitud } from "@/lib/admin/certificacion/servicio";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { horarioEnTexto } from "@/lib/agentes/versiones/diferencias";

const PERMISO: Record<string, string> = { sola: "Sin aprobación", aprobacion: "Con aprobación", humano: "Pasa a una persona", prohibida: "Prohibida" };
const FUERA: Record<string, string> = { responder_y_avisar: "Responde y avisa de que está fuera de horario", no_responder: "No responde hasta que abre", responder_normal: "Responde con normalidad" };
const texto = (s: string | null | undefined) => (s && s.trim() ? s : "—");

export default function Page({ params }: PageProps<"/admin/certificacion/[id]">) {
  return <Suspense fallback={<p role="status" className="text-body text-ink-2">Cargando la solicitud…</p>}><Revision params={params} /></Suspense>;
}

async function Revision({ params }: { params: PageProps<"/admin/certificacion/[id]">["params"] }) {
  const db = dbAdminDesdeEntorno();
  const sesion = db ? await sesionRevisor(await headers(), db) : null;
  if (!db || !sesion) notFound();
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await detalleDeSolicitud(db, sesion, id) : null;
  if (!d) notFound();

  const f = d.config.ficha, r = d.config.reglas;
  const ref = { clase: "agente" as const, id: d.id };
  const cerrada = ["aprobada", "rechazada", "cambios_solicitados", "cancelada", "examen_suspendido"].includes(d.estado);
  const esSegunda = d.estado === "segunda_opinion";
  const casosPorBloque = (b: string) => d.examen?.casos.filter((c) => c.bloque === b) ?? [];

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-small text-ink-2"><Link href="/admin/certificacion" className="underline-offset-4 hover:underline">Cola de revisión</Link> / {d.empresa}</p>
          <h1 className="text-h1">{d.agente.nombre} <span className="text-ink-2">· versión {d.version}</span></h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-small">
            <Etiqueta tono={d.estado === "aprobada" ? "bien" : d.estado === "rechazada" ? "mal" : esSegunda ? "aviso" : "acento"}>{NOMBRE_ESTADO[d.estado] ?? d.estado}</Etiqueta>
            <Etiqueta>{NOMBRE_TIPO[d.tipo] ?? d.tipo}</Etiqueta>
            <Etiqueta>Vía {(NOMBRE_VIA[d.via] ?? d.via).toLowerCase()}</Etiqueta>
            <Etiqueta>{NOMBRE_CATEGORIA[d.agente.categoria] ?? d.agente.categoria}</Etiqueta>
            {d.activarAlAprobar && <Etiqueta tono="aviso">Se activará sola al aprobar</Etiqueta>}
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

      {(d.revisiones.length > 0 || d.desacuerdo) && (
        <Seccion id="revisiones" titulo="Revisiones ya hechas" nota={d.desacuerdo ? "Las dos opiniones no coinciden: la cierra un administrador." : undefined}>
          <RevisionesHechas revisiones={d.revisiones} />
        </Seccion>
      )}

      <Seccion id="ficha" titulo="1. Ficha del agente" nota={`${d.empresa} · ${d.agente.departamento} · ${d.agente.versionCertificada === null ? "sin versión certificada" : `versión certificada: ${d.agente.versionCertificada}`}${d.resumen ? ` · ${d.resumen}` : ""}`}>
        <dl className="grid gap-4 md:grid-cols-2">
          <Dato t="Nombre y rol">{f.nombre} · {f.rol}</Dato>
          <Dato t="Modelo de IA">{f.modelo}</Dato>
          <Dato t="Objetivo">{texto(f.objetivo)}</Dato>
          <Dato t="Tono">{texto(f.tono)}</Dato>
          <Dato t="Lo que nunca hace">{texto(f.nunca_hace)}</Dato>
          <Dato t="El negocio">{texto(f.negocio_resumen)}</Dato>
        </dl>
        <div>
          <h3 className="mb-2 text-small text-ink-2">Instrucciones de la empresa</h3>
          <Bloque>{texto(f.instrucciones_empresa)}</Bloque>
        </div>
        {d.plantilla ? (
          <div>
            <h3 className="mb-2 text-small text-ink-2">Instrucciones base de la plantilla «{d.plantilla.nombre}» (versión {d.plantilla.version}) · la empresa no las ve</h3>
            <Bloque>{d.plantilla.instruccionesBase}</Bloque>
          </div>
        ) : <p className="text-small text-ink-2">Agente propio: no viene de ninguna plantilla.</p>}
        {d.instruccionesDelMotor && (
          <div>
            <h3 className="mb-2 text-small text-ink-2">Instrucciones que usa hoy el motor (campo antiguo, fuera de la versión)</h3>
            <Bloque>{d.instruccionesDelMotor}</Bloque>
          </div>
        )}
        {(d.config.correcciones?.length ?? 0) > 0 && (
          <div>
            <h3 className="mb-2 text-small text-ink-2">Correcciones aprendidas</h3>
            <ul className="list-disc pl-5 text-small">{d.config.correcciones!.map((c) => <li key={c.id}>{c.regla}</li>)}</ul>
          </div>
        )}
      </Seccion>

      <Seccion id="herramientas" titulo="2. Herramientas y permisos" nota={d.motivosSegundaOpinion.length ? `Necesita segunda opinión: ${d.motivosSegundaOpinion.join(" ")}` : "Ninguna herramienta obliga a segunda opinión."}>
        <Tabla caption="Herramientas del agente y su permiso" cols={[{ t: "Herramienta" }, { t: "Permiso" }, { t: "Límite diario" }, { t: "En la plantilla" }]} vacio={d.config.herramientas.length === 0} textoVacio="No tiene herramientas.">
          {d.config.herramientas.map((t) => {
            const p = d.plantilla?.herramientas.find((h) => h.id === t.tool_id);
            const masLaxo = p && ["sola", "aprobacion", "humano", "prohibida"].indexOf(t.permiso) < ["sola", "aprobacion", "humano", "prohibida"].indexOf(p.permiso_defecto);
            return (
              <tr key={t.tool_id}>
                <td className="font-semibold">{t.tool_id}</td>
                <td><Etiqueta tono={t.permiso === "sola" ? "aviso" : t.permiso === "prohibida" ? "neutro" : "bien"}>{PERMISO[t.permiso] ?? t.permiso}</Etiqueta></td>
                <td>{t.limite_diario ?? "Sin límite"}</td>
                <td className={masLaxo ? "text-status-error" : "text-ink-2"}>{d.plantilla ? (p ? `${PERMISO[p.permiso_defecto] ?? p.permiso_defecto}${p.editable ? " · editable" : " · fijo"}${masLaxo ? " · más laxo que la plantilla" : ""}` : "No está en la plantilla") : "—"}</td>
              </tr>
            );
          })}
        </Tabla>
      </Seccion>

      <Seccion id="reglas" titulo="3. Reglas, traspasos y conocimiento">
        {r ? (
          <dl className="grid gap-4 md:grid-cols-3">
            <Dato t="Horario">{horarioEnTexto(r.horario) ?? "—"} ({r.zona_horaria})</Dato>
            <Dato t="Fuera de horario">{FUERA[r.fuera_de_horario] ?? r.fuera_de_horario}{r.mensaje_fuera_horario ? ` · «${r.mensaje_fuera_horario}»` : ""}</Dato>
            <Dato t="Idioma">{r.idioma === "auto" ? "El del mensaje recibido" : r.idioma}</Dato>
            <Dato t="Aviso de IA">{r.aviso_ia_texto ? `«${r.aviso_ia_texto}»` : "Sin texto propio (usa el de por defecto)"}</Dato>
            <Dato t="Máximo de mensajes al día">{r.max_mensajes_dia ?? "Sin límite"}</Dato>
            <Dato t="Tope de créditos al mes">{r.tope_creditos_mes ?? "Sin tope"}</Dato>
          </dl>
        ) : <p className="text-small text-status-error">No tiene reglas configuradas (valen las de por defecto).</p>}
        <div>
          <h3 className="mb-2 text-small text-ink-2">Traspasos a otros agentes</h3>
          {d.traspasos.length === 0 ? <p className="text-small text-ink-2">Ninguno.</p> : (
            <ul className="flex flex-col gap-1 text-small">{d.traspasos.map((t, i) => <li key={i}>→ <span className="font-semibold">{t.destino}</span> ({t.tipo}){t.activo ? "" : " · desactivado"}: {t.condicion}</li>)}</ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-small text-ink-2">Fuentes de conocimiento (solo títulos: el contenido es de la empresa)</h3>
          {d.conocimiento.length === 0 ? <p className="text-small text-ink-2">Ninguna.</p> : (
            <ul className="flex flex-col gap-1 text-small">{d.conocimiento.map((k, i) => <li key={i}><span className="font-semibold">{k.titulo}</span> <span className="text-ink-2">· {k.tipo}{k.origen ? ` · ${k.origen}` : ""} · {k.ambito === "agente" ? "del agente" : "de toda la oficina"} · {k.estado}</span></li>)}</ul>
          )}
        </div>
      </Seccion>

      {d.diferencias && (
        <Seccion id="diferencias" titulo={`4. Diferencias con la versión certificada (${d.diferencias.desdeVersion} → ${d.version})`} nota={d.motivos.length ? `Clasificación: ${d.motivos.join(" ")}` : undefined}>
          <Tabla caption="Cambios respecto a la versión certificada" cols={[{ t: "Campo" }, { t: "Antes" }, { t: "Ahora" }]} vacio={d.diferencias.cambios.length === 0} textoVacio="No hay diferencias de configuración.">
            {d.diferencias.cambios.map((c, i) => (
              <tr key={i}><td className="font-semibold">{c.campo}</td><td className="break-words text-ink-2">{c.antes ?? "—"}</td><td className="break-words">{c.despues ?? <span className="text-ink-3">(quitado)</span>}</td></tr>
            ))}
          </Tabla>
        </Seccion>
      )}

      <Seccion id="examen" titulo={`${d.diferencias ? 5 : 4}. Examen técnico`}
        nota={d.examen ? `${d.examen.resultado === "aprobado" ? "Aprobado" : "Suspendido"} · nota global ${d.examen.notaGlobal ?? "—"}/100 · modelo ${d.examen.modelo} · coste de IA ${(d.examen.costeUsdMicros / 1_000_000).toLocaleString("es-ES", { style: "currency", currency: "USD" })} · ${new Date(d.examen.fecha).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : undefined}>
        {!d.examen ? <p className="text-small text-ink-2">Esta solicitud no tiene examen registrado.</p> : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {d.examen.bloques.map((b) => (
                <li key={b.bloque} className="rounded-card bg-white/6 p-3 text-small">
                  <p className="text-ink-2">{b.nombre}</p>
                  <p className="text-h2">{b.nota}<span className="text-small text-ink-3"> / 10</span></p>
                  <p className={b.aprobado ? "text-tiny" : "text-tiny text-status-error"}>{b.aprobado ? "Aprobado" : "Suspendido"} · mínimo {b.minima}</p>
                  <p className="mt-1 text-tiny text-ink-2">{b.resumen}</p>
                  {b.avisos.map((a) => <p key={a} className="mt-1 text-tiny text-status-waiting">{a}</p>)}
                </li>
              ))}
            </ul>
            {d.examen.bloques.filter((b) => casosPorBloque(b.bloque).length > 0).map((b) => {
              const casos = casosPorBloque(b.bloque);
              const fallidos = casos.filter((c) => !c.cumple).length;
              return (
                <details key={b.bloque} className="rounded-card bg-white/6 p-3" open={fallidos > 0}>
                  <summary className="cursor-pointer text-small font-semibold">{b.nombre}: {casos.length} casos{fallidos ? ` · ${fallidos} no cumplen` : " · todos cumplen"}</summary>
                  <ul className="mt-3 flex flex-col gap-3">
                    {casos.map((c) => (
                      <li key={c.id} className="border-t border-glass-border pt-3 text-small">
                        <p className="flex flex-wrap items-center gap-2">
                          <Etiqueta tono={c.cumple ? "bien" : "mal"}>{c.cumple ? "Cumple" : "No cumple"}</Etiqueta>
                          <span className="font-semibold">{c.titulo}</span>
                          <span className="text-tiny text-ink-3">{c.origen}{c.gravedad === "grave" ? " · grave" : ""} · nota {c.nota}</span>
                        </p>
                        <p className="mt-1 text-ink-2"><span className="text-ink-3">Entrada: </span>{c.entrada}</p>
                        {c.mensajesAlCliente.map((m, k) => <p key={k} className="mt-1"><span className="text-ink-3">Respondió: </span>{m}</p>)}
                        {c.mensajesAlCliente.length === 0 && c.respuesta && <p className="mt-1"><span className="text-ink-3">Respuesta final: </span>{c.respuesta}</p>}
                        {c.herramientas.length > 0 && <p className="mt-1 text-ink-2"><span className="text-ink-3">Herramientas: </span>{c.herramientas.map((h) => `${h.herramienta} (${h.estado})`).join(" · ")}</p>}
                        <p className="mt-1"><span className="text-ink-3">Veredicto: </span>{c.motivo}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </>
        )}
      </Seccion>

      <Seccion id="simulador" titulo={`${d.diferencias ? 6 : 5}. Simulador`} nota="Prueba tus propios casos contra la versión enviada.">
        <SimuladorRevisor solicitudId={d.id} />
      </Seccion>

      <Seccion id="decision" titulo={`${d.diferencias ? 7 : 6}. Lista de comprobación y decisión`}>
        {d.esMia ? <PanelDecision solicitud={ref} esSegundaOpinion={esSegunda} motivosSegundaOpinion={d.motivosSegundaOpinion} />
          : cerrada ? <p className="text-small text-ink-2">Solicitud cerrada: {(NOMBRE_ESTADO[d.estado] ?? d.estado).toLowerCase()}.</p>
          : <p className="text-small text-ink-2">{d.puedeCoger ? "Coge la solicitud para poder decidir." : d.asignadoNombre ? `La está revisando ${d.asignadoNombre}.` : d.motivoNoCoger}</p>}
      </Seccion>
    </>
  );
}
