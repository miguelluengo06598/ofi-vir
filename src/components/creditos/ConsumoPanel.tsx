"use client";

import { MessagesSquare } from "lucide-react";
import { useCreditos } from "./CreditosProvider";
import { Barra, Seccion, Vacio } from "./partes";
import { departmentMeta, type DepartmentId } from "@/components/glass";
import { fmtNumber } from "@/lib/format";

type Fila = { clave: string; nombre: string; creditos: number };

function Lista({ titulo, filas, vacio }: { titulo: string; filas: Fila[]; vacio: string }) {
  const max = Math.max(0, ...filas.map((f) => f.creditos));
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-body font-semibold">{titulo}</h3>
      {filas.length === 0 ? <Vacio>{vacio}</Vacio> : (
        <ul className="flex flex-col gap-3">
          {filas.map((f) => (
            <li key={f.clave} className="flex flex-col gap-1">
              <p className="flex items-baseline justify-between gap-3 text-small">
                <span className="min-w-0 truncate">{f.nombre}</span>
                <span className="shrink-0 font-semibold">{fmtNumber(f.creditos)}</span>
              </p>
              <Barra valor={f.creditos} max={max} etiqueta={`${f.nombre}: ${fmtNumber(f.creditos)} créditos`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TIPOS: { concepto: string; nombre: string }[] = [
  { concepto: "tarea_simple", nombre: "Tareas simples" },
  { concepto: "tarea_estandar", nombre: "Tareas estándar" },
  { concepto: "tarea_experta", nombre: "Tareas expertas" },
  { concepto: "correo", nombre: "Correos enviados" },
];

export function ConsumoPanel() {
  const { resumen } = useCreditos();
  if (!resumen) return null;
  const c = resumen.consumoMes;
  const de = (concepto: string) => c.porTipoDeTarea.find((t) => t.concepto === concepto)?.creditos ?? 0;
  const traspasos = de("traspaso");
  const nombreDept = (id: string | null, nombre: string) => (id && id in departmentMeta ? departmentMeta[id as DepartmentId].label : nombre);

  return (
    <Seccion id="consumo" titulo="Consumo del mes" acciones={<p className="text-small text-ink-2">Total: <strong className="text-white">{fmtNumber(c.total)} créditos</strong></p>}>
      {c.total === 0 ? (
        <Vacio>Este mes todavía no se han gastado créditos.</Vacio>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Lista titulo="Por departamento" vacio="Sin consumo asignado a departamentos." filas={c.porDepartamento.map((d, i) => ({ clave: `${d.departamentoId ?? i}`, nombre: nombreDept(d.departamentoId, d.nombre), creditos: d.creditos }))} />
          <Lista titulo="Por agente" vacio="Sin consumo asignado a agentes." filas={c.porAgente.map((a, i) => ({ clave: `${a.agenteId ?? i}`, nombre: a.nombre, creditos: a.creditos }))} />
          <div className="flex flex-col gap-4">
            <Lista titulo="Por tipo de tarea" vacio="" filas={TIPOS.map((t) => ({ clave: t.concepto, nombre: t.nombre, creditos: de(t.concepto) }))} />
            <p className="flex items-center justify-between gap-3 rounded-card bg-white/6 p-3 text-small">
              <span className="flex items-center gap-2"><MessagesSquare size={16} aria-hidden="true" className="shrink-0 text-ink-2" />Comunicación entre departamentos</span>
              <span className="shrink-0 font-semibold">{fmtNumber(traspasos)}</span>
            </p>
          </div>
        </div>
      )}
    </Seccion>
  );
}
