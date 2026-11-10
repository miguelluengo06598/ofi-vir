"use client";

import { DemoEnVivo, demoDiferida } from "@/components/marketing/DemoEnVivo";
import { ReservaDemoOficina } from "./ReservaDemoOficina";

const DemoOficina = demoDiferida(() => import("./DemoOficina"));

export function DemoOficinaDiferida() {
  return (
    <figure aria-label="Demostración de la oficina con datos de ejemplo">
      <figcaption className="sr-only">
        Cinco departamentos (Ventas, Atención al cliente, Marketing, Operaciones · CRM y Dirección) con sus agentes trabajando. Cada pocos
        segundos un agente pasa trabajo a otro departamento y una línea de luz une las dos tarjetas. Son datos de ejemplo.
      </figcaption>
      <DemoEnVivo
        componente={DemoOficina}
        reserva={<ReservaDemoOficina />}
        descripcion="Cinco departamentos (Ventas, Atención al cliente, Marketing, Operaciones · CRM y Dirección) con sus agentes trabajando. Cada pocos segundos un agente pasa trabajo a otro departamento y una línea de luz une las dos tarjetas. Son datos de ejemplo."
      />
    </figure>
  );
}
