import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Dato, Etiqueta, Seccion, Tabla } from "@/components/admin/certificacion/piezas";
import { AccionesCliente } from "@/components/admin/clientes/AccionesCliente";
import { CambiarPropietario, FichaInterna, FormularioFiscales, NuevaNota, ReenviarInvitacion, ResolverCambio } from "@/components/admin/clientes/Formularios";
import { IndicadorSalud } from "@/components/admin/clientes/IndicadorSalud";
import { exigirRolPlataforma, type SesionPlataforma } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { esOperativa, MOTIVOS_SUSPENSION, NOMBRE_ESTADO_EMPRESA, NOMBRE_ESTADO_OFICINA, puedeHacer, ROLES_CLIENTES, SERVICIOS } from "@/lib/admin/clientes/config";
import * as ficha from "@/lib/admin/clientes/ficha";
import { equipoSamgple } from "@/lib/admin/clientes/listado";
import { fmtNumber } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

const PESTANAS = [
  { id: "resumen", t: "Resumen" }, { id: "fiscales", t: "Datos fiscales" }, { id: "miembros", t: "Miembros" }, { id: "oficina", t: "Oficina" },
  { id: "creditos", t: "Créditos" }, { id: "implantacion", t: "Implantación" }, { id: "soporte", t: "Soporte" }, { id: "actividad", t: "Actividad" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—");
const momento = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const eur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const NOMBRE_ROL: Record<string, string> = { propietario: "Propietario", propietario_invitado: "Propietario (invitación)", admin: "Administrador", miembro: "Miembro" };
const NOMBRE_ORIGEN: Record<string, string> = { pack: "Pack", bono_mensual: "Bono mensual", prueba: "Prueba", regalo: "Regalo", ajuste: "Ajuste" };
const NOMBRE_AGENTE: Record<string, string> = { borrador: "Borrador", en_pruebas: "En pruebas", en_certificacion: "En certificación", certificado: "Certificado", activo: "Activo", pausado: "Pausado", archivado: "Archivado", rechazado: "Rechazado", suspendido: "Suspendido" };
const tonoAgente = (e: string) => (e === "activo" ? "bien" : e === "suspendido" || e === "rechazado" ? "mal" : e === "pausado" || e === "en_certificacion" ? "aviso" : "neutro") as "bien" | "mal" | "aviso" | "neutro";

export default function Page({ params, searchParams }: PageProps<"/admin/clientes/[id]">) {
  return (
    <Suspense fallback={<p role="status" className="text-body text-ink-2">Cargando la ficha…</p>}>
      <Ficha params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Ficha({ params, searchParams }: { params: PageProps<"/admin/clientes/[id]">["params"]; searchParams: PageProps<"/admin/clientes/[id]">["searchParams"] }) {
  const db = dbAdminDesdeEntorno();
  const sesion = db ? await exigirRolPlataforma(ROLES_CLIENTES, await headers(), db) : null;
  const { id } = await params;
  if (!db || !sesion || !UUID.test(id)) notFound();
  const sp = await searchParams;
  const pestana: Pestana = PESTANAS.some((p) => p.id === sp.pestana) ? (sp.pestana as Pestana) : "resumen";
  const ahora = new Date();
  const c = await ficha.cabeceraCliente(db, id, ahora);
  if (!c) notFound();
  const motivo = MOTIVOS_SUSPENSION.find((m) => m.id === c.suspendidaMotivo)?.nombre;

  return (
    <>
      <Link href="/admin/clientes" className="inline-flex w-fit items-center gap-2 text-small text-ink-2 hover:text-white focus-visible:outline-2 focus-visible:outline-white"><ArrowLeft size={16} aria-hidden="true" />Clientes</Link>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">{c.nombre}</h1>
          <Etiqueta tono={esOperativa(c.estado) ? (c.oficinaPausada ? "aviso" : c.estado === "en_implantacion" ? "acento" : "bien") : "mal"}>{NOMBRE_ESTADO_EMPRESA[c.estado] ?? c.estado}{motivo ? ` · ${motivo.toLowerCase()}` : ""}</Etiqueta>
          {esOperativa(c.estado) && c.oficinaPausada && <Etiqueta tono="aviso">{c.pausadaPorSamgple ? "Pausada por MyOfia" : "Agentes pausados por la empresa"}</Etiqueta>}
          <IndicadorSalud salud={c.salud} id={`cab-${c.id}`} />
        </div>
        <AccionesCliente companyId={c.id} nombre={c.nombre} estado={c.estado} pausada={c.oficinaPausada} pausadaPorSamgple={c.pausadaPorSamgple} estadoOficina={c.estadoOficina} saldo={c.saldo}
          permisos={{ creditos: puedeHacer(sesion.roles, "creditos"), pausarSuspender: puedeHacer(sesion.roles, "pausarSuspender"), reactivar: puedeHacer(sesion.roles, "reactivar"), exportar: puedeHacer(sesion.roles, "exportar"), borrar: puedeHacer(sesion.roles, "borrar") }} />
      </header>

      <nav aria-label="Secciones de la ficha" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {PESTANAS.map((p) => (
          <Link key={p.id} href={`/admin/clientes/${c.id}?pestana=${p.id}`} aria-current={p.id === pestana ? "page" : undefined}
            className={`glass glass-interactive rounded-pill px-4 py-2 text-small whitespace-nowrap text-white ${p.id === pestana ? "is-active border-accent/60 bg-accent/30!" : ""}`}>{p.t}</Link>
        ))}
      </nav>

      <Contenido pestana={pestana} db={db} sesion={sesion} c={c} ahora={ahora} />
    </>
  );
}

async function Contenido({ pestana, db, sesion, c, ahora }: { pestana: Pestana; db: SupabaseClient; sesion: SesionPlataforma; c: ficha.Cabecera; ahora: Date }) {
  const viva = c.estado !== "borrada";
  switch (pestana) {
    case "resumen": {
      const [r, equipo] = await Promise.all([ficha.resumenCliente(db, c.id), equipoSamgple(db)]);
      return (
        <div className="grid gap-6 lg:grid-cols-2">
          <Seccion id="datos" titulo="Empresa">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Dato t="Sector">{c.sector ?? "—"}</Dato>
              <Dato t="Alta">{dia(c.creadaEn)}</Dato>
              <Dato t="Propietario">{c.propietario ? `${c.propietario.nombre} · ${c.propietario.email}` : "Sin propietario"}</Dato>
              <Dato t="Estado de la oficina">{c.estadoOficina ? NOMBRE_ESTADO_OFICINA[c.estadoOficina] ?? c.estadoOficina : "—"}</Dato>
              <Dato t="Agentes activos">{fmtNumber(c.agentesActivos)}{c.agentesSuspendidos ? ` (${c.agentesSuspendidos} suspendidos)` : ""}</Dato>
              <Dato t="Saldo">{fmtNumber(c.saldo)} créditos</Dato>
              <Dato t="Consumo del mes">{fmtNumber(c.consumoMes)} créditos</Dato>
              <Dato t="Implantación">{c.enImplantacion ? "En curso" : "No"}</Dato>
              {c.suspendidaEn && <Dato t="Suspendida desde">{momento(c.suspendidaEn)}</Dato>}
              {c.borradaEn && <Dato t="Borrada">{momento(c.borradaEn)}</Dato>}
            </dl>
          </Seccion>
          <Seccion id="salud" titulo="Salud" nota="Actividad reciente, saldo, valoraciones negativas (30 días), agentes suspendidos y recargas fallidas (30 días). Manda la peor señal.">
            <IndicadorSalud salud={c.salud} id={`det-${c.id}`} detalle />
          </Seccion>
          <Seccion id="ficha" titulo="Responsable y servicios" nota={r.fichaActualizadaEn ? `Actualizado el ${momento(r.fichaActualizadaEn)}` : "Solo la ve MyOfia."}>
            <FichaInterna companyId={c.id} responsable={c.responsable?.id ?? null} servicios={r.servicios} equipo={equipo} editable={viva && puedeHacer(sesion.roles, "editarFicha")} />
            {r.servicios.length > 0 && <p className="text-tiny text-ink-3">Contratados: {r.servicios.map((s) => SERVICIOS.find((x) => x.id === s)?.nombre ?? s).join(", ")}</p>}
          </Seccion>
          <Seccion id="notas" titulo="Notas internas" nota="Solo MyOfia. Nunca las ve la empresa.">
            {viva && puedeHacer(sesion.roles, "anotar") && <NuevaNota companyId={c.id} />}
            {r.notas.length === 0 ? <p className="text-small text-ink-2">Sin notas todavía.</p> : (
              <ul className="flex flex-col gap-3">
                {r.notas.map((n) => <li key={n.id} className="rounded-card bg-white/6 p-3"><p className="text-tiny text-ink-3">{n.autor} · {momento(n.creadoEn)}</p><p className="mt-1 text-small whitespace-pre-wrap">{n.texto}</p></li>)}
              </ul>
            )}
          </Seccion>
        </div>
      );
    }
    case "fiscales": {
      const d = await ficha.datosFiscales(db, c.id);
      return (
        <Seccion id="fiscales" titulo="Datos fiscales" nota={d ? `Para las facturas de servicios. Actualizados el ${momento(d.actualizadoEn)}.` : "Todavía no hay datos fiscales. Se usarán en las facturas de servicios."}>
          <FormularioFiscales companyId={c.id} datos={d} editable={viva && puedeHacer(sesion.roles, "editarFiscales")} />
        </Seccion>
      );
    }
    case "miembros": {
      const m = await ficha.miembrosCliente(db, c.id, ahora);
      const candidatos = m.miembros.filter((x) => x.estado === "activo" && x.rol !== "propietario").map((x) => ({ id: x.userId, nombre: `${x.nombre} · ${x.email}` }));
      const pendiente = m.cambios.find((x) => x.estado === "pendiente");
      const reenviar = viva && esOperativa(c.estado) && puedeHacer(sesion.roles, "reenviarInvitacion");
      return (
        <>
          <Seccion id="miembros" titulo="Miembros" nota="Personas de la empresa, su rol y su estado.">
            {viva && puedeHacer(sesion.roles, "pedirCambioPropietario") && !pendiente && <div><CambiarPropietario companyId={c.id} candidatos={candidatos} esAdminSamgple={sesion.roles.includes("admin_samgple")} /></div>}
            {pendiente && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-status-waiting/15 p-3 text-small">
                <p>Cambio de propietario pendiente: <strong>{pendiente.actual}</strong> → <strong>{pendiente.nuevo}</strong>. Pedido por {pendiente.solicitadoPor} el {dia(pendiente.creadoEn)} (caduca el {dia(pendiente.caducaEn)}). Motivo: {pendiente.motivo}</p>
                {sesion.roles.includes("admin_samgple") && <ResolverCambio cambioId={pendiente.id} />}
              </div>
            )}
            <Tabla caption="Miembros de la empresa" vacio={m.miembros.length === 0} textoVacio="Sin miembros." cols={[{ t: "Persona" }, { t: "Rol" }, { t: "Estado" }, { t: "Puede aprobar" }, { t: "Desde" }]}>
              {m.miembros.map((x) => (
                <tr key={x.userId}>
                  <td><span className="block">{x.nombre}</span><span className="block text-tiny text-ink-3">{x.email}</span></td>
                  <td>{NOMBRE_ROL[x.rol] ?? x.rol}</td>
                  <td><Etiqueta tono={x.estado === "activo" ? "bien" : x.estado === "invitado" ? "aviso" : "neutro"}>{x.estado}</Etiqueta></td>
                  <td>{x.rol === "miembro" ? (x.puedeAprobar ? "Sí" : "No") : "Sí (por su rol)"}</td>
                  <td className="whitespace-nowrap">{dia(x.desde)}</td>
                </tr>
              ))}
            </Tabla>
          </Seccion>
          <Seccion id="invitaciones" titulo="Invitaciones">
            <Tabla caption="Invitaciones de la empresa" vacio={m.invitaciones.length === 0} textoVacio="Sin invitaciones." cols={[{ t: "Correo" }, { t: "Rol" }, { t: "Estado" }, { t: "Enviada" }, { t: "Caduca" }, { t: "" }]}>
              {m.invitaciones.map((x) => (
                <tr key={x.id}>
                  <td>{x.email}</td><td>{NOMBRE_ROL[x.rol] ?? x.rol}</td>
                  <td><Etiqueta tono={x.estado === "aceptada" ? "bien" : x.estado === "pendiente" ? "aviso" : "neutro"}>{x.estado}</Etiqueta></td>
                  <td className="whitespace-nowrap">{dia(x.creadaEn)}</td><td className="whitespace-nowrap">{dia(x.caducaEn)}</td>
                  <td>{reenviar && (x.estado === "pendiente" || x.estado === "caducada") && <ReenviarInvitacion companyId={c.id} invitacionId={x.id} email={x.email} />}</td>
                </tr>
              ))}
            </Tabla>
          </Seccion>
          {m.cambios.length > 0 && (
            <Seccion id="cambios" titulo="Cambios de propietario">
              <Tabla caption="Historial de cambios de propietario" cols={[{ t: "Cambio" }, { t: "Estado" }, { t: "Pedido por" }, { t: "Fecha" }, { t: "Motivo" }]}>
                {m.cambios.map((x) => (
                  <tr key={x.id}><td>{x.actual} → {x.nuevo}</td><td>{x.estado}{x.resueltoVia ? ` (${x.resueltoVia === "propietario" ? "por el propietario" : "por admin_samgple"})` : ""}</td><td>{x.solicitadoPor}</td><td className="whitespace-nowrap">{dia(x.creadoEn)}</td><td>{x.motivo}</td></tr>
                ))}
              </Tabla>
            </Seccion>
          )}
        </>
      );
    }
    case "oficina": {
      const deps = await ficha.oficinaCliente(db, c.id);
      return (
        <Seccion id="oficina" titulo="Departamentos y agentes" nota="Estado y certificación de cada agente. Sin contenido de conversaciones ni de tareas.">
          {deps.length === 0 ? <p className="text-small text-ink-2">Sin departamentos.</p> : deps.map((d) => (
            <div key={d.id} className="flex flex-col gap-2">
              <h3 className="text-body font-semibold">{d.nombre} <span className="text-small font-normal text-ink-3">· {d.agentes.length} agentes</span></h3>
              <Tabla caption={`Agentes de ${d.nombre}`} vacio={d.agentes.length === 0} textoVacio="Sin agentes en este departamento." cols={[{ t: "Agente" }, { t: "Estado" }, { t: "Certificación" }, { t: "Versión" }, { t: "Modelo" }, { t: "Plantilla" }]}>
                {d.agentes.map((a) => (
                  <tr key={a.id}>
                    <td><span className="block">{a.nombre}</span><span className="block text-tiny text-ink-3">{a.puesto}</span></td>
                    <td><Etiqueta tono={tonoAgente(a.estado)}>{NOMBRE_AGENTE[a.estado] ?? a.estado}</Etiqueta>{a.pausadoMotivo && <span className="block text-tiny text-ink-3">{a.pausadoMotivo === "certificacion_caducada" ? "Certificación caducada" : "Pausado por la empresa"}</span>}</td>
                    <td>{a.certificadoHasta ? (new Date(a.certificadoHasta) > ahora ? `Vigente hasta ${dia(a.certificadoHasta)}` : `Caducó el ${dia(a.certificadoHasta)}`) : "Sin certificar"}{a.solicitud && <span className="block text-tiny text-ink-3">Última solicitud: {a.solicitud.replaceAll("_", " ")}</span>}</td>
                    <td className="whitespace-nowrap">v{a.versionActual ?? "—"}{a.versionCertificada ? ` (cert. v${a.versionCertificada})` : ""}</td>
                    <td className="whitespace-nowrap">{a.modelo}</td>
                    <td>{a.plantilla ?? "Propio"}</td>
                  </tr>
                ))}
              </Tabla>
            </div>
          ))}
        </Seccion>
      );
    }
    case "creditos": {
      const k = await ficha.creditosCliente(db, c.id, ahora);
      return (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Seccion id="saldo" titulo="Saldo y ajustes">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Dato t="Saldo disponible">{fmtNumber(c.saldo)} créditos</Dato>
                <Dato t="Estado de la oficina">{NOMBRE_ESTADO_OFICINA[k.ajustes.estadoOficina] ?? k.ajustes.estadoOficina}</Dato>
                <Dato t="Tope mensual">{k.ajustes.tope === null ? "Sin tope" : `${fmtNumber(k.ajustes.tope)} créditos`}</Dato>
                <Dato t="Recarga automática">{k.ajustes.recargaActiva ? `Sí: pack ${k.ajustes.recargaPack ?? "—"} por debajo de ${fmtNumber(k.ajustes.recargaUmbral ?? 0)}` : "No"}</Dato>
                <Dato t="Bono mensual">{k.ajustes.bonoPack ? `Pack ${k.ajustes.bonoPack}` : "No"}</Dato>
                {k.ajustes.pausadaPorSamgple && <Dato t="Pausa de MyOfia">{MOTIVOS_SUSPENSION.find((m) => m.id === k.ajustes.motivoPausa)?.nombre ?? "Sí"}</Dato>}
              </dl>
            </Seccion>
            <Seccion id="consumo" titulo={`Consumo del mes · ${fmtNumber(k.consumo.total)} créditos`}>
              <div className="grid gap-4 sm:grid-cols-2">
                {([["Por agente", k.consumo.porAgente], ["Por departamento", k.consumo.porDepartamento]] as const).map(([t, filas]) => (
                  <div key={t}><h3 className="mb-2 text-small text-ink-2">{t}</h3>
                    {filas.length === 0 ? <p className="text-small text-ink-3">Sin consumo.</p> : <ul className="flex flex-col gap-1 text-small">{filas.map((f) => <li key={f.nombre} className="flex justify-between gap-3"><span>{f.nombre}</span><span className="whitespace-nowrap">{fmtNumber(f.creditos)}</span></li>)}</ul>}
                  </div>
                ))}
              </div>
            </Seccion>
          </div>
          <Seccion id="lotes" titulo="Lotes" nota="Se gastan primero los que caducan antes.">
            <Tabla caption="Lotes de créditos" vacio={k.lotes.length === 0} textoVacio="Sin lotes." cols={[{ t: "Origen" }, { t: "Iniciales", der: true }, { t: "Restantes", der: true }, { t: "Creado" }, { t: "Caduca" }]}>
              {k.lotes.map((l) => (
                <tr key={l.id} className={new Date(l.caducaEn) < ahora || l.restantes === 0 ? "text-ink-3" : ""}>
                  <td>{NOMBRE_ORIGEN[l.origen] ?? l.origen}{l.pack ? ` · ${l.pack}` : ""}</td><td className="text-right">{fmtNumber(l.iniciales)}</td><td className="text-right">{fmtNumber(l.restantes)}</td>
                  <td className="whitespace-nowrap">{dia(l.creadoEn)}</td><td className="whitespace-nowrap">{dia(l.caducaEn)}{new Date(l.caducaEn) < ahora ? " (caducado)" : ""}</td>
                </tr>
              ))}
            </Tabla>
          </Seccion>
          <Seccion id="compras" titulo="Compras">
            <Tabla caption="Compras de la empresa" vacio={k.compras.length === 0} textoVacio="Sin compras." cols={[{ t: "Fecha" }, { t: "Pack" }, { t: "Modalidad" }, { t: "Importe", der: true }, { t: "IVA", der: true }, { t: "Total", der: true }, { t: "Estado" }]}>
              {k.compras.map((p) => (
                <tr key={p.id}><td className="whitespace-nowrap">{dia(p.creadoEn)}</td><td>{p.pack}</td><td>{p.modalidad === "bono_mensual" ? "Bono mensual" : "Único"}</td><td className="text-right">{eur(p.importe)}</td><td className="text-right">{eur(p.iva)}</td><td className="text-right">{eur(p.total)}</td><td><Etiqueta tono={p.estado === "pagada" ? "bien" : "neutro"}>{p.estado}</Etiqueta></td></tr>
              ))}
            </Tabla>
          </Seccion>
          {k.movimientosAdmin.length > 0 && (
            <Seccion id="ajustes" titulo="Regalos y ajustes" nota="Movimientos de tipo ajuste del libro contable (regalos y correcciones). Quién y por qué está en Actividad.">
              <Tabla caption="Regalos y ajustes" cols={[{ t: "Fecha" }, { t: "Concepto" }, { t: "Créditos", der: true }]}>
                {k.movimientosAdmin.map((m, i) => <tr key={i}><td className="whitespace-nowrap">{momento(m.creadoEn)}</td><td>{m.concepto.replaceAll("_", " ")}</td><td className={`text-right ${m.creditos < 0 ? "text-status-error" : ""}`}>{m.creditos > 0 ? "+" : ""}{fmtNumber(m.creditos)}</td></tr>)}
              </Tabla>
            </Seccion>
          )}
        </>
      );
    }
    case "implantacion": {
      const i = await ficha.implantacionCliente(db, c.id);
      if (!i) return <Seccion id="impl" titulo="Implantación"><p className="text-small text-ink-2">Esta empresa no tiene implantación registrada.</p></Seccion>;
      const hechas = i.tareas.filter((t) => t.hechaEn).length;
      return (
        <Seccion id="impl" titulo={`Implantación · ${hechas} de ${i.tareas.length} tareas hechas`} nota={`Estado: ${i.estado.replace("_", " ")} · Responsable: ${i.responsable ?? "sin asignar"} · Inicio: ${dia(i.inicio)}${i.objetivoFin ? ` · Objetivo: ${dia(i.objetivoFin)}` : ""}`}>
          {i.tareas.length === 0 ? <p className="text-small text-ink-2">Sin tareas.</p> : (
            <ol className="flex flex-col gap-2">
              {i.tareas.map((t) => {
                const vencida = !t.hechaEn && t.venceEn && new Date(t.venceEn) < ahora;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-white/6 p-3 text-small">
                    <span className={t.hechaEn ? "text-ink-3 line-through" : ""}>{t.titulo}</span>
                    <span className={vencida ? "font-semibold text-status-error" : "text-ink-2"}>{t.hechaEn ? `Hecha el ${dia(t.hechaEn)}` : t.venceEn ? `${vencida ? "Vencida" : "Vence"} el ${dia(t.venceEn)}` : "Sin fecha"}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Seccion>
      );
    }
    case "soporte": {
      const s = await ficha.soporteCliente(db, c.id);
      return (
        <>
          <Seccion id="consultas" titulo="Consultas" nota="Solo el asunto y su estado: nunca datos de los clientes de la empresa.">
            <Tabla caption="Consultas de soporte" vacio={s.consultas.length === 0} textoVacio="Sin consultas." cols={[{ t: "Asunto" }, { t: "Prioridad" }, { t: "Estado" }, { t: "Asignada a" }, { t: "Abierta" }, { t: "Resuelta" }]}>
              {s.consultas.map((x) => (
                <tr key={x.id}><td>{x.asunto}</td><td><Etiqueta tono={x.prioridad === "urgente" ? "mal" : x.prioridad === "alta" ? "aviso" : "neutro"}>{x.prioridad}</Etiqueta></td><td>{x.estado.replace("_", " ")}</td><td>{x.asignadaA ?? "—"}</td><td className="whitespace-nowrap">{dia(x.creadoEn)}</td><td className="whitespace-nowrap">{dia(x.resueltaEn)}</td></tr>
              ))}
            </Tabla>
          </Seccion>
          <Seccion id="accesos" titulo="Accesos asistidos">
            <p className="text-small text-ink-2">El acceso asistido (entrar en la oficina de la empresa con su autorización) todavía no existe en la plataforma: no hay accesos que mostrar. MyOfia no puede ver los datos de la empresa sin él.</p>
          </Seccion>
          <Seccion id="exportaciones" titulo="Exportaciones de datos" nota="El archivo solo lo descarga la empresa (propietario o administrador). Aquí solo se ve el estado.">
            <Tabla caption="Exportaciones de datos" vacio={s.exportaciones.length === 0} textoVacio="Sin exportaciones." cols={[{ t: "Pedida" }, { t: "Por" }, { t: "Estado" }, { t: "Tamaño", der: true }, { t: "Caduca" }, { t: "Descargada" }, { t: "Motivo" }]}>
              {s.exportaciones.map((x) => (
                <tr key={x.id}><td className="whitespace-nowrap">{momento(x.creadoEn)}</td><td>{x.solicitadaPor}</td><td><Etiqueta tono={x.estado === "lista" ? "bien" : x.estado === "error" ? "mal" : "neutro"}>{x.estado}</Etiqueta></td>
                  <td className="text-right whitespace-nowrap">{x.tamano === null ? "—" : `${fmtNumber(Math.max(1, Math.round(x.tamano / 1024)))} KB`}</td><td className="whitespace-nowrap">{dia(x.caducaEn)}</td><td className="whitespace-nowrap">{x.descargadaEn ? momento(x.descargadaEn) : "No"}</td><td>{x.motivo}</td></tr>
              ))}
            </Tabla>
          </Seccion>
        </>
      );
    }
    case "actividad": {
      const a = await ficha.actividadCliente(db, c.id);
      return (
        <Seccion id="actividad" titulo="Actividad" nota="Registro de auditoría de MyOfia sobre esta empresa: solo inserción, nunca se edita ni se borra.">
          {a.length === 0 ? <p className="text-small text-ink-2">Sin acciones registradas.</p> : (
            <ul className="flex flex-col gap-2">
              {a.map((e) => (
                <li key={e.id}>
                  <div className="flex flex-col gap-1 rounded-card bg-white/6 p-3">
                    <p className="flex flex-wrap items-center justify-between gap-2 text-small"><strong>{e.accion}</strong><span className="text-tiny text-ink-3">{momento(e.creadoEn)} · {e.actor}{e.ip ? ` · ${e.ip}` : ""}</span></p>
                    {e.motivo && <p className="text-small text-ink-2">Motivo: {e.motivo}</p>}
                    {(e.antes != null || e.despues != null) && (
                      <details className="text-tiny text-ink-2"><summary className="cursor-pointer">Antes y después</summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded-card bg-black/30 p-3 whitespace-pre-wrap">{JSON.stringify({ antes: e.antes, despues: e.despues }, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      );
    }
  }
}
