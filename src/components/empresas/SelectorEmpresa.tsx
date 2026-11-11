"use client";

import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";

type Empresa = { id: string; nombre: string; nombreRol: string };

/**
 * Empresa activa (solo si la persona pertenece a más de una, p. ej. alguien de MyOfia que ayuda a varios clientes).
 * Al cambiar, el servidor comprueba que es miembro activo y guarda la cookie; después se recarga la página con los datos de esa empresa.
 */
export function SelectorEmpresa() {
  const [datos, setDatos] = useState<{ activa: string | null; empresas: Empresa[] } | null>(null);
  useEffect(() => {
    void fetch("/api/empresas", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setDatos(d)).catch(() => undefined);
  }, []);
  if (!datos || datos.empresas.length < 2) return null;
  async function elegir(companyId: string) {
    const r = await fetch("/api/empresas/activa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId }) });
    if (r.ok) window.location.reload();
  }
  return (
    <label className="glass hidden items-center gap-2 rounded-pill px-3 py-2 text-small text-white md:inline-flex">
      <Building2 size={16} aria-hidden="true" className="text-ink-2" />
      <span className="sr-only">Empresa activa</span>
      <select className="cursor-pointer bg-transparent outline-none" value={datos.activa ?? ""} onChange={(e) => void elegir(e.target.value)}>
        {datos.empresas.map((e) => <option key={e.id} value={e.id} className="text-black">{e.nombre} · {e.nombreRol}</option>)}
      </select>
    </label>
  );
}
