import { connection } from "next/server";
import { Suspense } from "react";
import { MemoryView } from "@/components/memory/MemoryView";
import { loadMemoryData } from "@/lib/memory/loadMemory";

// Lee la base en cada visita; sin backend configurado, la vista usa los datos de ejemplo.
async function MemoryFromDb() {
  await connection();
  return <MemoryView initialData={await loadMemoryData()} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MemoryFromDb />
    </Suspense>
  );
}
