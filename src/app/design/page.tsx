"use client";

import Image from "next/image";
import { Bell, Plus, Search } from "lucide-react";
import {
  Avatar,
  GlassCard,
  GlassPanel,
  PillButton,
  StatusBadge,
  departmentMeta,
  statusMeta,
  type AgentStatus,
  type DepartmentId,
} from "@/components/glass";

// Página temporal de revisión del sistema de cristal. Borrar al terminar el diseño.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-tiny text-ink-3">{label}</span>
      {children}
    </div>
  );
}

const departments = Object.keys(departmentMeta) as DepartmentId[];
const statuses = Object.keys(statusMeta) as AgentStatus[];

export default function DesignPage() {
  return (
    <>
      <Image src="/scenes/oficina.png" alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-linear-to-b from-black/25 to-black/45"
      />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 md:p-10">
        <h1 className="text-h1">Sistema de cristal · revisión</h1>

        <Section title="GlassPanel">
          <div className="grid gap-4 md:grid-cols-2">
            <GlassPanel className="p-6">
              <p className="text-body">Panel normal</p>
              <p className="text-small text-ink-2">Radio 28px, blur 28px, borde y brillo interior.</p>
            </GlassPanel>
            <GlassPanel strong className="p-6">
              <p className="text-body">Panel activo / hover</p>
              <p className="text-small text-ink-2">Fondo glass-bg-strong (16%).</p>
            </GlassPanel>
          </div>
        </Section>

        <Section title="PillButton">
          <GlassPanel className="flex flex-wrap gap-6 p-6">
            <Labeled label="Normal">
              <PillButton icon={Plus}>Nuevo agente</PillButton>
            </Labeled>
            <Labeled label="Hover">
              <PillButton icon={Search} hovered>
                Buscar
              </PillButton>
            </Labeled>
            <Labeled label="Activo">
              <PillButton icon={Bell} active>
                Notificaciones
              </PillButton>
            </Labeled>
            <Labeled label="Sin icono">
              <PillButton>Ventas</PillButton>
            </Labeled>
            <Labeled label="Deshabilitado">
              <PillButton disabled>Bloqueado</PillButton>
            </Labeled>
          </GlassPanel>
        </Section>

        <Section title="Avatar y StatusBadge">
          <GlassPanel className="flex flex-col gap-6 p-6">
            <div className="flex flex-wrap items-end gap-6">
              {departments.map((d, i) => (
                <Labeled key={d} label={departmentMeta[d].label}>
                  <Avatar name={["Lucía Ramos", "Marcos Gil", "Ana Ortiz", "Pablo Sanz", "Eva Cruz"][i]} tone={d} size={48} />
                </Labeled>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-6">
              {statuses.map((s) => (
                <Labeled key={s} label={statusMeta[s].label}>
                  <div className="flex items-center gap-3">
                    <Avatar name="Agente Ventas" status={s} />
                    <StatusBadge status={s} />
                  </div>
                </Labeled>
              ))}
            </div>
          </GlassPanel>
        </Section>

        <Section title="GlassCard">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Labeled label="Normal (pasa el ratón para ver el hover real)">
              <GlassCard
                className="w-full"
                department="ventas"
                title="Cualificador de leads"
                description="Puntúa los contactos entrantes y los asigna al comercial adecuado."
                tag="Certificado"
                actions={<PillButton>Abrir</PillButton>}
              />
            </Labeled>
            <Labeled label="Hover (forzado)">
              <GlassCard
                hovered
                className="w-full"
                department="atencion"
                title="Respuestas de soporte"
                description="Resuelve consultas frecuentes y escala a una persona cuando hace falta."
                tag="Nuevo"
                actions={<PillButton>Abrir</PillButton>}
              />
            </Labeled>
            <Labeled label="Con acción activa">
              <GlassCard
                className="w-full"
                department="marketing"
                title="Calendario de contenidos"
                description="Planifica publicaciones semanales según la campaña activa."
                tag="Popular"
                actions={
                  <>
                    <PillButton active>Activo</PillButton>
                    <PillButton>Configurar</PillButton>
                  </>
                }
              />
            </Labeled>
            <GlassCard
              className="w-full"
              department="operaciones"
              title="Sincronizador de CRM"
              description="Mantiene los datos de clientes al día entre herramientas."
              tag="Certificado"
            />
            <GlassCard
              className="w-full"
              department="direccion"
              title="Informe semanal"
              description="Resume ventas, incidencias y gasto de créditos para la dirección."
              tag="Beta"
            />
          </div>
        </Section>
      </main>
    </>
  );
}
