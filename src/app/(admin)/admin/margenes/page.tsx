import { notFound } from "next/navigation";
import { Suspense } from "react";
import { headers } from "next/headers";
import { AlertTriangle, Coins, Hourglass, Landmark } from "lucide-react";
import { GlassPanel } from "@/components/glass";
import { sesionAdminIdesie } from "@/lib/admin/acceso";
import { dbAdminDesdeEntorno } from "@/lib/admin/entorno";
import { mesActual, obtenerMargenes, primerDiaDelMes, type DatosMargenes } from "@/lib/admin/margenes";
import { fmtEur, fmtNumber } from "@/lib/format";

const eur = (centimos: number) => fmtEur(centimos / 100);
const eurFino = (centimos: number) => (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 3, maximumFractionDigits: 3 });
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
const nombreMes = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const TIPO_TAREA: Record<string, string> = { simple: "Simple", estandar: "Estándar", experta: "Experta", sin_tipo: "Sin tipo" };
const ALERTA: Record<string, string> = { margen_superado: "Margen superado", limite_pasos: "Límite de pasos alcanzado", recarga_fallida: "Recarga automática fallida" };

/** Margen por debajo del que el coste de IA supera el umbral de alerta: se marca con texto, no solo con color. */
const Margen = ({ valor, umbral }: { valor: number | null; umbral: number }) => {
  const bajo = valor !== null && valor < (1 - umbral) * 100;
  return <span className={bajo ? "font-semibold text-status-error" : ""}>{pct(valor)}{bajo && <span className="ml-1 text-tiny">· bajo</span>}</span>;
};

function Seccion({ id, titulo, nota, children }: { id: string; titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <GlassPanel as="section" aria-labelledby={id} className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 id={id} className="text-h2">{titulo}</h2>
        {nota && <p className="mt-1 text-small text-ink-2">{nota}</p>}
      </div>
      {children}
    </GlassPanel>
  );
}

type Col = { t: string; der?: boolean };
function Tabla({ caption, cols, children, vacio }: { caption: string; cols: Col[]; children: React.ReactNode; vacio?: boolean }) {
  if (vacio) return <p className="rounded-card bg-white/6 p-4 text-small text-ink-2">Sin datos en este periodo.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-small">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-tiny text-ink-3">
          <tr>{cols.map((c) => <th key={c.t} scope="col" className={`py-2 pr-3 font-normal ${c.der ? "text-right" : ""}`}>{c.t}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-glass-border [&_td]:py-2 [&_td]:pr-3 [&_td:last-child]:pr-0">{children}</tbody>
      </table>
    </div>
  );
}
const D = "text-right whitespace-nowrap";

function Resumen({ d }: { d: DatosMargenes }) {
  const items = [
    { icono: Landmark, t: "Créditos vendidos y sin consumir", v: `${fmtNumber(d.saldoVivo.creditos)} créditos`, s: `≈ ${fmtEur(d.saldoVivo.euros)} · ${d.saldoVivo.empresas} empresas (saldo vivo ahora)` },
    { icono: Hourglass, t: `Créditos caducados en ${nombreMes(d.mes)}`, v: `${fmtNumber(d.caducadosMes)} créditos`, s: `≈ ${fmtEur(d.caducadosMes / 100)} que no costaron IA` },
    { icono: Coins, t: "Tipo de cambio", v: `1 € = ${d.cambioUsdPorEur.toLocaleString("es-ES")} US$`, s: "Variable CAMBIO_USD_POR_EUR" },
    { icono: AlertTriangle, t: `Alertas en ${nombreMes(d.mes)}`, v: String(d.alertas.length), s: `Umbral de margen: el coste de IA no debe pasar del ${Math.round(d.umbralMargen * 100)} % de lo cobrado` },
  ];
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ icono: I, t, v, s }) => (
        <li key={t}>
          <GlassPanel className="flex h-full flex-col gap-1 rounded-card p-4">
            <p className="flex items-center gap-2 text-small text-ink-2"><I size={16} aria-hidden="true" className="shrink-0" />{t}</p>
            <p className="text-h2">{v}</p>
            <p className="text-tiny text-ink-3">{s}</p>
          </GlassPanel>
        </li>
      ))}
    </ul>
  );
}

/** Con cacheComponents, lo que lee cabeceras y parámetros va dentro de Suspense (y por tanto siempre se calcula en cada petición). */
export default function Page({ searchParams }: PageProps<"/admin/margenes">) {
  return (
    <Suspense fallback={<p role="status" className="text-body text-ink-2">Cargando márgenes…</p>}>
      <Panel searchParams={searchParams} />
    </Suspense>
  );
}

async function Panel({ searchParams }: { searchParams: PageProps<"/admin/margenes">["searchParams"] }) {
  const db = dbAdminDesdeEntorno();
  // Cualquiera que no sea admin_samgple ve un 404: el panel no existe para él.
  if (!db || !(await sesionAdminIdesie(await headers(), db))) notFound();

  const q = (await searchParams).mes;
  const pedido = typeof q === "string" && primerDiaDelMes(q) ? q : mesActual();
  const d = await obtenerMargenes(db, pedido);

  const ahora = mesActual();
  const [ay, am] = ahora.split("-").map(Number);
  const meses = Array.from({ length: 12 }, (_, i) => { const t = new Date(Date.UTC(ay, am - 1 - i, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; });
  const enMes = d.porEmpresaMes.filter((f) => f.mes === d.mes);
  const total = enMes.reduce((a, f) => ({ cobrado: a.cobrado + f.cobradoCentimos, coste: a.coste + f.costeIaCentimos, cred: a.cred + f.creditosConsumidos }), { cobrado: 0, coste: 0, cred: 0 });

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">Márgenes</h1>
          <p className="text-body text-ink-2">Panel interno de IDESIE. Solo cifras agregadas: nada de correos, contactos ni memoria de las empresas.</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="mes" className="text-small text-ink-2">Mes</label>
          <select id="mes" name="mes" defaultValue={d.mes} className="glass cursor-pointer rounded-pill bg-transparent px-4 py-2 text-small text-white">
            {meses.map((m) => <option key={m} value={m} className="text-black">{nombreMes(m)}</option>)}
          </select>
          <button type="submit" className="glass glass-interactive cursor-pointer rounded-pill px-4 py-2 text-small text-white">Ver</button>
        </form>
      </header>

      <Resumen d={d} />

      <Seccion id="empresas" titulo="1. Por empresa y mes" nota="Cobrado = compras pagadas (sin IVA). Margen bruto = cobrado − coste real de IA. El consumo no tiene por qué coincidir con lo cobrado ese mes: los créditos se compran y se gastan en momentos distintos.">
        <Tabla caption="Cobrado, créditos consumidos, coste de IA y margen por empresa y mes" vacio={d.porEmpresaMes.length === 0}
          cols={[{ t: "Mes" }, { t: "Empresa" }, { t: "Cobrado", der: true }, { t: "Créditos consumidos", der: true }, { t: "Coste de IA", der: true }, { t: "Margen bruto", der: true }, { t: "Margen %", der: true }]}>
          {d.porEmpresaMes.map((f) => (
            <tr key={f.empresaId + f.mes} className={f.mes === d.mes ? "" : "text-ink-2"}>
              <td className="whitespace-nowrap">{nombreMes(f.mes)}</td><td>{f.empresa}</td>
              <td className={D}>{eur(f.cobradoCentimos)}</td><td className={D}>{fmtNumber(f.creditosConsumidos)}</td>
              <td className={D}>{eur(f.costeIaCentimos)}</td><td className={D}>{eur(f.margenCentimos)}</td>
              <td className={D}><Margen valor={f.margenPct} umbral={d.umbralMargen} /></td>
            </tr>
          ))}
          {enMes.length > 1 && (
            <tr className="font-semibold">
              <td>{nombreMes(d.mes)}</td><td>Total</td><td className={D}>{eur(total.cobrado)}</td><td className={D}>{fmtNumber(total.cred)}</td>
              <td className={D}>{eur(total.coste)}</td><td className={D}>{eur(total.cobrado - total.coste)}</td>
              <td className={D}><Margen valor={total.cobrado > 0 ? ((total.cobrado - total.coste) / total.cobrado) * 100 : null} umbral={d.umbralMargen} /></td>
            </tr>
          )}
        </Tabla>
      </Seccion>

      <Seccion id="agentes" titulo={`2. Por agente · ${nombreMes(d.mes)}`} nota="De peor a mejor margen: los de arriba son los que hay que optimizar. Margen % = (créditos cobrados − coste de IA) ÷ créditos cobrados, con 1 crédito = 1 céntimo.">
        <Tabla caption="Margen por agente, ordenado de peor a mejor" vacio={d.porAgente.length === 0}
          cols={[{ t: "Agente" }, { t: "Empresa" }, { t: "Tareas", der: true }, { t: "Créditos cobrados", der: true }, { t: "Coste de IA", der: true }, { t: "Margen %", der: true }, { t: "Alertas de margen", der: true }]}>
          {d.porAgente.map((f) => (
            <tr key={f.empresa + f.agente}>
              <td className="font-semibold">{f.agente}</td><td className="text-ink-2">{f.empresa}</td>
              <td className={D}>{fmtNumber(f.tareas)}</td><td className={D}>{fmtNumber(f.creditosCobrados)}</td>
              <td className={D}>{eur(f.costeIaCentimos)}</td><td className={D}><Margen valor={f.margenPct} umbral={d.umbralMargen} /></td>
              <td className={D}>{fmtNumber(f.alertasMargen)}</td>
            </tr>
          ))}
        </Tabla>
      </Seccion>

      <Seccion id="tipos" titulo={`3. Por tipo de tarea · ${nombreMes(d.mes)}`} nota="Coste medio real de IA frente a lo que se cobra por cada tarea.">
        <Tabla caption="Coste medio real de IA y precio cobrado por tipo de tarea" vacio={d.porTipo.length === 0}
          cols={[{ t: "Tipo" }, { t: "Tareas", der: true }, { t: "Coste medio de IA", der: true }, { t: "Cobrado de media", der: true }, { t: "Margen %", der: true }]}>
          {d.porTipo.map((f) => (
            <tr key={f.tipo}>
              <td className="font-semibold">{TIPO_TAREA[f.tipo] ?? f.tipo}</td><td className={D}>{fmtNumber(f.tareas)}</td>
              <td className={D}>{eurFino(f.costeMedioCentimos)}</td><td className={D}>{eurFino(f.cobradoMedioCentimos)}</td>
              <td className={D}><Margen valor={f.margenPct} umbral={d.umbralMargen} /></td>
            </tr>
          ))}
        </Tabla>
      </Seccion>

      <Seccion id="alertas" titulo={`4. Alertas internas · ${nombreMes(d.mes)}`} nota="Margen superado, límite de pasos alcanzado y recargas automáticas fallidas (las 100 más recientes).">
        <Tabla caption="Alertas internas del mes" vacio={d.alertas.length === 0}
          cols={[{ t: "Fecha" }, { t: "Alerta" }, { t: "Empresa" }, { t: "Agente" }, { t: "Detalle" }]}>
          {d.alertas.map((a) => (
            <tr key={a.id} className="align-top">
              <td className="whitespace-nowrap text-ink-2">{new Date(a.creadoEn).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
              <td className="font-semibold">{ALERTA[a.tipo] ?? a.tipo}</td><td>{a.empresa}</td><td>{a.agente ?? "—"}</td>
              <td className="text-ink-2">{Object.entries(a.detalle).map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`).join(" · ")}</td>
            </tr>
          ))}
        </Tabla>
      </Seccion>
    </>
  );
}
