import { embedderFromEnv } from "../memory/embedderFromEnv.ts";
import { createMemoryService } from "../memory/service.ts";
import { SupabaseMemoryStore } from "../memory/supabaseStore.ts";
import type { Rebote } from "./service.ts";

/** Anota en la memoria del contacto que su correo no es válido (sin vector si Voyage no está disponible: no se pierde el aviso). */
export async function anotarCorreoNoValido(rebote: Rebote): Promise<void> {
  const store = SupabaseMemoryStore.fromEnv();
  if (!store) throw new Error("Falta la configuración de Supabase para anotar el rebote.");
  const svc = createMemoryService({ store, embedder: embedderFromEnv() });
  const fecha = new Date().toISOString().slice(0, 10);
  await svc.guardarRecuerdo(
    rebote.companyId,
    {
      agentId: rebote.agentId,
      contacto: { nombre: rebote.contactName, email: rebote.contactEmail },
      nodos: [{
        clave: "n",
        tipo: "dato",
        titulo: "Correo no válido",
        contenido: `El correo a ${rebote.address} rebotó el ${fecha}${rebote.motivo ? `: ${rebote.motivo}` : ""}. No volver a escribir a esta dirección sin confirmarla.`,
      }],
      conexiones: [],
    },
    { permitirSinVector: true },
  );
}
