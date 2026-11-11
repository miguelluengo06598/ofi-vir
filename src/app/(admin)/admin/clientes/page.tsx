import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import { Etiqueta, Tabla } from "@/components/admin/certificacion/piezas";
import { IndicadorSalud } from "@/components/admin/clientes/IndicadorSalud";
import { exigirRolPlataforma } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { esOperativa, NOMBRE_ESTADO_EMPRESA, ROLES_CLIENTES } from "@/lib/admin/clientes/config";
import { contarPorColor, equipoSamgple, filtrarClientes, leerFiltros, obtenerClientes } from "@/lib/admin/clientes/listado";
import { fmtNumber } from "@/lib/format";

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—");
function haceCuanto(iso: string | null, ahora: Date) {
  if (!iso) return "Nunca";
  const dias = Math.floor((ahora.getTime() - new Date(iso).getTime()) / 86_400_000);
  return dias <= 0 ? "Hoy" : dias === 1 ? "Ayer" : `Hace ${dias} días`;
}
const control = "rounded-pill border border-glass-border bg-black/25 px-3 py-2 text-small text-white";

export default function Page({ searchParams }: PageProps<"/admin/clientes">) {
  return (
    <Suspense fallback={<p role="status" className="text-body text-ink-2">Cargando clientes…</p>}>
      <Listado searchParams={searchParams} />
    </Suspense>
  );
}

async function Listado({ searchParams }: { searchParams: PageProps<"/admin/clientes">["searchParams"] }) {
  const db = dbAdminDesdeEntorno();
  if (!db || !(await exigirRolPlataforma(ROLES_CLIENTES, await headers(), db))) notFound();
  const ahora = new Date();
  const filtros = leerFiltros(await searchParams);
  const [todos, equipo] = await Promise.all([obtenerClientes(db, ahora), equipoSamgple(db)]);
  const clientes = filtrarClientes(todos, filtros);
  const sectores = [...new Set(todos.map((c) => c.sector).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, "es"));
  const colores = contarPorColor(todos.filter((c) => c.estado !== "borrada"));

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">Clientes</h1>
          <p className="text-body text-ink-2">Empresas, su salud y su consumo. Solo metadatos y cifras: nada de conversaciones, contactos ni memoria.</p>
        </div>
        <p className="text-small text-ink-2" aria-label="Salud de los clientes">
          <span className="text-status-working">{colores.verde} bien</span> · <span className="text-status-waiting">{colores.ambar} atención</span> · <span className="text-status-error">{colores.rojo} en riesgo</span>
        </p>
      </header>

      <GlassPanel as="section" aria-label="Buscar y filtrar" className="p-4 sm:p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-56 flex-1 items-center gap-2 rounded-pill border border-glass-border bg-black/25 px-3 py-2 text-small">
            <Search size={16} aria-hidden="true" className="text-ink-2" />
            <span className="sr-only">Buscar</span>
            <input name="q" defaultValue={filtros.q ?? ""} placeholder="Nombre, sector o propietario" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-ink-3" />
          </label>
          <label className="flex flex-col gap-1 text-tiny text-ink-3">Estado
            <select name="estado" defaultValue={filtros.estado ?? ""} className={control}>
              <option value="" className="text-black">Todas menos las borradas</option>
              {Object.entries(NOMBRE_ESTADO_EMPRESA).map(([v, t]) => <option key={v} value={v} className="text-black">{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-tiny text-ink-3">Sector
            <select name="sector" defaultValue={filtros.sector ?? ""} className={control}>
              <option value="" className="text-black">Todos</option>
              {sectores.map((s) => <option key={s} value={s} className="text-black">{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-tiny text-ink-3">Responsable
            <select name="responsable" defaultValue={filtros.responsable ?? ""} className={control}>
              <option value="" className="text-black">Cualquiera</option>
              <option value="ninguno" className="text-black">Sin responsable</option>
              {equipo.map((p) => <option key={p.id} value={p.id} className="text-black">{p.nombre}</option>)}
            </select>
          </label>
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small">
            <legend className="sr-only">Filtros rápidos</legend>
            <label className="flex items-center gap-2"><input type="checkbox" name="implantacion" value="1" defaultChecked={!!filtros.implantacion} /> En implantación</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="saldoBajo" value="1" defaultChecked={!!filtros.saldoBajo} /> Saldo bajo</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="riesgo" value="1" defaultChecked={!!filtros.riesgo} /> En riesgo</label>
          </fieldset>
          <div className="flex gap-2">
            <button type="submit" className="glass glass-interactive cursor-pointer rounded-pill px-4 py-2 text-small text-white">Filtrar</button>
            <Link href="/admin/clientes" className="glass glass-interactive rounded-pill px-4 py-2 text-small text-white">Limpiar</Link>
          </div>
        </form>
      </GlassPanel>

      <GlassPanel as="section" aria-labelledby="lista" className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 id="lista" className="text-h2">{clientes.length === todos.length ? `${fmtNumber(clientes.length)} empresas` : `${fmtNumber(clientes.length)} de ${fmtNumber(todos.length)} empresas`}</h2>
        <Tabla caption="Empresas clientes con su estado, consumo, saldo y salud" vacio={clientes.length === 0} textoVacio="Ninguna empresa cumple esos filtros."
          cols={[{ t: "Empresa" }, { t: "Sector" }, { t: "Estado" }, { t: "Propietario" }, { t: "Alta" }, { t: "Agentes activos", der: true }, { t: "Consumo del mes", der: true }, { t: "Saldo", der: true }, { t: "Última actividad" }, { t: "Salud" }]}>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/admin/clientes/${c.id}`} className="font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-white">{c.nombre}</Link>
                <span className="mt-1 flex flex-wrap gap-1">
                  {c.enImplantacion && <Etiqueta tono="acento">En implantación</Etiqueta>}
                  {c.responsable && <Etiqueta>{c.responsable.nombre}</Etiqueta>}
                </span>
              </td>
              <td>{c.sector ?? <span className="text-ink-3">—</span>}</td>
              <td>
                <Etiqueta tono={esOperativa(c.estado) ? (c.oficinaPausada ? "aviso" : c.estado === "en_implantacion" ? "acento" : "bien") : "mal"}>{NOMBRE_ESTADO_EMPRESA[c.estado] ?? c.estado}</Etiqueta>
                {esOperativa(c.estado) && c.oficinaPausada && <span className="mt-1 block text-tiny text-ink-3">{c.pausadaPorSamgple ? "Pausada por MyOfia" : "Agentes pausados"}</span>}
              </td>
              <td>{c.propietario ? <><span className="block">{c.propietario.nombre}</span><span className="block text-tiny text-ink-3">{c.propietario.email}</span></> : <span className="text-ink-3">Sin propietario</span>}</td>
              <td className="whitespace-nowrap">{fecha(c.creadaEn)}</td>
              <td className="text-right">{fmtNumber(c.agentesActivos)}</td>
              <td className="text-right whitespace-nowrap">{fmtNumber(c.consumoMes)} cr.</td>
              <td className="text-right whitespace-nowrap">{fmtNumber(c.saldo)} cr.</td>
              <td className="whitespace-nowrap">{haceCuanto(c.ultimaActividad, ahora)}</td>
              <td><IndicadorSalud salud={c.salud} id={c.id} /></td>
            </tr>
          ))}
        </Tabla>
      </GlassPanel>
    </>
  );
}
