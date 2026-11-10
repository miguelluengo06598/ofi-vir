import { Suspense } from "react";
import { OfficeView } from "@/components/office/OfficeView";
import { AvisoImplantacion } from "@/components/oficina/AvisoImplantacion";

export default function OficinaPage() {
  return (
    <>
      {/* Solo aparece mientras la empresa está en implantación. */}
      <Suspense fallback={null}>
        <div className="mb-6 empty:hidden"><AvisoImplantacion /></div>
      </Suspense>
      <OfficeView />
    </>
  );
}
