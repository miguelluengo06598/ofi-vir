import { connection } from "next/server";
import { Suspense } from "react";
import { MemoryView } from "@/components/memory/MemoryView";
import { sesionDeAccion } from "@/lib/empresas/sesionAccion";
import { esGestor } from "@/lib/empresas/permisos";
import { loadMemoryData } from "@/lib/memory/loadMemory";

// Lee la memoria de la empresa de la sesión en cada visita (el layout ya ha comprobado que hay sesión y empresa).
async function MemoryFromDb() {
  await connection();
  const sesion = await sesionDeAccion();
  const data = sesion ? await loadMemoryData(sesion.companyId) : null;
  return <MemoryView real initialData={data} puedeEditar={sesion ? esGestor(sesion.rol) : false} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MemoryFromDb />
    </Suspense>
  );
}
