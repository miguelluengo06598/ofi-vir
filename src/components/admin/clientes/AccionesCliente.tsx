"use client";

/**
 * Barra de acciones de la ficha de un cliente. Solo muestra los botones que el rol permite (el servidor lo vuelve a decidir).
 * Todas piden confirmación y motivo; borrar pide además marcar una casilla y escribir el nombre exacto de la empresa.
 */
import { Ban, Coins, Download, Pause, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { PillButton } from "@/components/glass";
import { ajustarCreditos, borrarEmpresa, cambiarEstado, exportar } from "@/app/(admin)/admin/clientes/acciones";
import { LIMITES_CREDITOS, MOTIVOS_SUSPENSION, type MotivoSuspension } from "@/lib/admin/clientes/config";
import { fmtNumber } from "@/lib/format";
import { campo, Dialogo, etiqueta } from "./Dialogo";

export type PermisosAcciones = { creditos: boolean; pausarSuspender: boolean; reactivar: boolean; exportar: boolean; borrar: boolean };
type Props = {
  companyId: string; nombre: string; estado: string; pausada: boolean; pausadaPorSamgple: boolean; estadoOficina: string | null;
  saldo: number; permisos: PermisosAcciones;
};
type Abierto = null | "creditos" | "pausar" | "suspender" | "reactivar" | "exportar" | "borrar";

const clave = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

function MotivoTipo({ valor, onCambio }: { valor: MotivoSuspension; onCambio: (m: MotivoSuspension) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-small text-ink-2">Causa</legend>
      {MOTIVOS_SUSPENSION.map((m) => (
        <label key={m.id} className="flex items-center gap-2 text-small">
          <input type="radio" name="motivo-tipo" value={m.id} checked={valor === m.id} onChange={() => onCambio(m.id)} /> {m.nombre}
        </label>
      ))}
    </fieldset>
  );
}

export function AccionesCliente({ companyId, nombre, estado, pausada, pausadaPorSamgple, estadoOficina, saldo, permisos }: Props) {
  const [abierto, setAbierto] = useState<Abierto>(null);
  const cerrar = () => setAbierto(null);
  // Créditos
  const [tipo, setTipo] = useState<"regalo" | "ajuste">("regalo");
  const [creditos, setCreditos] = useState("");
  const [dias, setDias] = useState(String(LIMITES_CREDITOS.diasPorDefecto));
  const [claveOp, setClaveOp] = useState(clave);
  // Pausa / suspensión
  const [motivoTipo, setMotivoTipo] = useState<MotivoSuspension>("impago");
  // Borrado
  const [entiendo, setEntiendo] = useState(false);
  const [nombreEscrito, setNombreEscrito] = useState("");

  const borrada = estado === "borrada";
  const suspendida = estado === "suspendida";
  const reactivable = suspendida || pausadaPorSamgple || estadoOficina === "pausada" || estadoOficina === "pendiente_borrado";
  const n = Number.parseInt(creditos, 10);
  const creditosValidos = Number.isInteger(n) && n !== 0 && Math.abs(n) <= LIMITES_CREDITOS.maximoPorOperacion && (tipo === "ajuste" || n > 0) && (n > 0 || -n <= saldo);

  if (borrada) return <p className="text-small text-ink-2">Empresa borrada: no admite acciones. Se conservan su libro contable, sus compras, sus datos fiscales y sus servicios contratados.</p>;

  const abrir = (a: Abierto) => { setAbierto(a); setClaveOp(clave()); setEntiendo(false); setNombreEscrito(""); };

  return (
    <div className="flex flex-wrap gap-2">
      {permisos.creditos && <PillButton icon={Coins} onClick={() => abrir("creditos")}>Regalar o ajustar créditos</PillButton>}
      {permisos.pausarSuspender && !pausada && !suspendida && <PillButton icon={Pause} onClick={() => abrir("pausar")}>Pausar oficina</PillButton>}
      {permisos.pausarSuspender && !suspendida && <PillButton icon={Ban} onClick={() => abrir("suspender")}>Suspender empresa</PillButton>}
      {permisos.reactivar && reactivable && <PillButton icon={Play} onClick={() => abrir("reactivar")}>Reactivar</PillButton>}
      {permisos.exportar && <PillButton icon={Download} onClick={() => abrir("exportar")}>Exportar datos</PillButton>}
      {permisos.borrar && <PillButton icon={Trash2} onClick={() => abrir("borrar")} className="border-status-error/60!">Borrar empresa</PillButton>}

      <Dialogo abierto={abierto === "creditos"} onCerrar={cerrar} titulo="Regalar o ajustar créditos" etiquetaConfirmar="Confirmar movimiento" listo={creditosValidos}
        explicacion={<>
          <p>Un <strong>regalo</strong> crea un lote nuevo de origen «regalo» con su caducidad. Un <strong>ajuste</strong> corrige el saldo: en positivo crea un lote «ajuste»; en negativo retira créditos de los lotes que caducan antes. Nada se edita: todo queda como un movimiento nuevo del libro contable.</p>
          <p>Saldo actual: {fmtNumber(saldo)} créditos.</p>
        </>}
        onConfirmar={(motivo) => ajustarCreditos({ companyId, tipo, creditos: n, diasCaducidad: Number.parseInt(dias, 10), motivo, clave: claveOp })}>
        <fieldset className="flex gap-4">
          <legend className="sr-only">Tipo de movimiento</legend>
          {(["regalo", "ajuste"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-small"><input type="radio" name="tipo" checked={tipo === t} onChange={() => setTipo(t)} /> {t === "regalo" ? "Regalo" : "Ajuste"}</label>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={etiqueta}>Créditos {tipo === "ajuste" && "(negativo para retirar)"}
            <input className={campo} inputMode="numeric" value={creditos} onChange={(e) => setCreditos(e.target.value.replace(/[^\d-]/g, ""))} placeholder={tipo === "regalo" ? "500" : "-200"} />
          </label>
          {(tipo === "regalo" || n > 0) && (
            <label className={etiqueta}>Caducan en (días)
              <input className={campo} type="number" min={1} max={LIMITES_CREDITOS.diasMaximo} value={dias} onChange={(e) => setDias(e.target.value)} />
            </label>
          )}
        </div>
        {creditos && !creditosValidos && <p className="text-tiny text-status-waiting">{n < 0 && -n > saldo ? "No se puede retirar más que el saldo disponible." : "Revisa la cantidad."}</p>}
      </Dialogo>

      <Dialogo abierto={abierto === "pausar"} onCerrar={cerrar} titulo={`Pausar la oficina de ${nombre}`} etiquetaConfirmar="Pausar oficina"
        explicacion={<p>Sus agentes no empezarán ninguna tarea nueva; lo que llegue se guarda. El equipo de la empresa sigue entrando, ve el aviso y <strong>no puede reanudarla por su cuenta</strong>. Se avisa al propietario.</p>}
        onConfirmar={(motivo) => cambiarEstado({ companyId, accion: "pausar", motivoTipo, motivo })}>
        <MotivoTipo valor={motivoTipo} onCambio={setMotivoTipo} />
      </Dialogo>

      <Dialogo abierto={abierto === "suspender"} onCerrar={cerrar} titulo={`Suspender ${nombre}`} etiquetaConfirmar="Suspender empresa" peligro
        explicacion={<p>Nadie de la empresa podrá entrar en su oficina y sus agentes quedan pausados. Los datos no se borran. Se avisa al propietario.</p>}
        onConfirmar={(motivo) => cambiarEstado({ companyId, accion: "suspender", motivoTipo, motivo })}>
        <MotivoTipo valor={motivoTipo} onCambio={setMotivoTipo} />
      </Dialogo>

      <Dialogo abierto={abierto === "reactivar"} onCerrar={cerrar} titulo={`Reactivar ${nombre}`} etiquetaConfirmar="Reactivar"
        explicacion={<p>Quita la suspensión o la pausa de SAMGPLE y, si la oficina estaba pausada por inactividad o pendiente de borrado, la recupera y cancela el borrado. Se avisa a la empresa.</p>}
        onConfirmar={(motivo) => cambiarEstado({ companyId, accion: "reactivar", motivo })} />

      <Dialogo abierto={abierto === "exportar"} onCerrar={cerrar} titulo="Exportar los datos de la empresa" etiquetaConfirmar="Generar exportación"
        explicacion={<>
          <p>Se genera en segundo plano un archivo JSON con sus datos (derecho de portabilidad). Al terminar, la empresa recibe un aviso y <strong>solo su propietario o un administrador</strong> puede descargarlo durante 7 días.</p>
          <p>SAMGPLE ve el estado y el tamaño en la pestaña Soporte, nunca el contenido.</p>
        </>}
        onConfirmar={(motivo) => exportar({ companyId, motivo })} />

      <Dialogo abierto={abierto === "borrar"} onCerrar={cerrar} titulo={`Borrar ${nombre}`} etiquetaConfirmar="Borrar definitivamente" peligro listo={entiendo && nombreEscrito === nombre}
        explicacion={<>
          <p>Se borran <strong>todos</strong> sus datos: miembros, agentes, contactos, correos, memoria, conocimiento y archivos, tareas, conexiones (y sus secretos) y las cuentas de las personas que no pertenezcan a otra empresa.</p>
          <p>Se conservan solo el libro contable de créditos, los lotes, las compras (facturas), los datos fiscales y los servicios contratados. <strong>No se puede deshacer.</strong></p>
        </>}
        onConfirmar={(motivo) => borrarEmpresa({ companyId, nombre: nombreEscrito, motivo, entiendo })}>
        <label className="flex items-start gap-2 text-small">
          <input type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} className="mt-1" />
          Entiendo que el borrado es definitivo y que la empresa ha sido avisada.
        </label>
        <label className={etiqueta}>Escribe el nombre exacto de la empresa: <span className="font-semibold text-white">{nombre}</span>
          <input className={campo} value={nombreEscrito} onChange={(e) => setNombreEscrito(e.target.value)} autoComplete="off" spellCheck={false} disabled={!entiendo} />
        </label>
      </Dialogo>
    </div>
  );
}
