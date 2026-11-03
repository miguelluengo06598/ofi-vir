import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { GlassPanel } from "@/components/glass";
import { RefreshButton } from "@/components/status/RefreshButton";
import { StatusView } from "@/components/status/StatusView";

export const metadata = { title: "Estado de los servicios" };

/** Solo en desarrollo: revela qué servicios hay configurados. */
async function Guarded() {
  await connection();
  if (process.env.NODE_ENV === "production") notFound();
  return <StatusView />;
}

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Estado</h1>
          <p className="text-body text-ink-2">Qué servicios están conectados. Nunca se muestran las claves.</p>
        </div>
        <RefreshButton />
      </div>
      <Suspense
        fallback={
          <GlassPanel className="p-6">
            <p role="status" className="text-small text-ink-2">
              Comprobando servicios…
            </p>
          </GlassPanel>
        }
      >
        <Guarded />
      </Suspense>
    </div>
  );
}
