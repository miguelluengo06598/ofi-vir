"use client";

import { Coins, FileImage, FileSpreadsheet, FileText, LifeBuoy, Mail } from "lucide-react";
import { CicloDelAgente } from "@/components/agents/CicloDelAgente";
import { CorreccionesAgente } from "@/components/agents/CorreccionesAgente";
import { RecuerdosRecientes } from "@/components/agents/RecuerdosRecientes";
import { SimuladorAgente } from "@/components/agents/SimuladorAgente";
import { TareaDePrueba } from "@/components/agents/TareaDePrueba";
import { HistorialCalidad } from "@/components/agents/HistorialCalidad";
import { useConsumoDeAgente } from "@/components/creditos/useConsumoDeAgente";
import { EmailQuota } from "@/components/emails/EmailQuota";
import { contactDirectory, contactsOfAgent } from "@/data/emails";
import { useApprovals } from "@/components/ApprovalsProvider";
import { Avatar, PillButton, StatusBadge, departmentMeta } from "@/components/glass";
import type { OfficeAgent } from "@/data/departments";
import { expertFor } from "@/data/experts";
import { getAgentProfile, type AgentFile } from "@/data/messages";
import { TIPOS_DE_TAREA, TIPOS_DE_TAREA_IDS } from "@/lib/creditos/tarifas";
import { NOMBRE_TIPO_TAREA } from "@/lib/creditos/tipos";
import { fmtNumber } from "@/lib/format";

const fileIcon = { doc: FileText, sheet: FileSpreadsheet, image: FileImage } as const satisfies Record<
  AgentFile["kind"],
  unknown
>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-tiny text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

export function AgentProfile({ agent }: { agent: OfficeAgent }) {
  const profile = getAgentProfile(agent.id);
  const consumoMes = useConsumoDeAgente(agent.name);
  const { openConsult, openContact } = useApprovals();
  const contacts = contactsOfAgent(agent.id);
  const expert = expertFor(agent.creator);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar name={agent.name} tone={agent.departmentId} status={agent.status} size={88} />
        <h2 className="text-h2">{agent.name}</h2>
        <p className="text-small text-ink-2">{agent.role}</p>
        <p className="text-tiny text-ink-3">{departmentMeta[agent.departmentId].label}</p>
        <StatusBadge
          status={agent.status}
          detail={agent.consultation ? `respuesta en ~${agent.consultation.estimatedHours} h` : undefined}
        />
      </div>

      <Section title="Creador">
        <p className="text-small">{agent.creator}</p>
      </Section>

      {expert && (
        <PillButton
          icon={LifeBuoy}
          disabled={!!agent.consultation}
          onClick={() => openConsult(agent.id)}
          className="w-full flex-col items-start rounded-card! text-left"
        >
          <span className="font-semibold">{agent.consultation ? "Consulta en curso" : "Consultar al experto"}</span>
          <span className="text-tiny text-ink-2">
            {expert.name} · {expert.company}
          </span>
          <span className="text-tiny text-ink-2">
            {agent.consultation
              ? `Respuesta estimada: ${agent.consultation.estimatedHours} h`
              : `Responde en ~${expert.avgResponseHours} h · ${expert.price} créditos`}
          </span>
        </PillButton>
      )}

      <Section title="Herramientas conectadas">
        <ul className="flex flex-wrap gap-2">
          {agent.tools.map((t) => (
            <li key={t} className="rounded-pill bg-glass-strong px-3 py-1 text-tiny">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Correos">
        <EmailQuota agentId={agent.id} />
        {contacts.length > 0 && (
          <ul aria-label="Contactos con correos" className="flex flex-col gap-1">
            {contacts.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => openContact(id)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-card px-2 py-1.5 text-left text-small hover:bg-white/10"
                >
                  <Mail size={14} aria-hidden="true" className="shrink-0 text-ink-2" />
                  <span className="min-w-0 flex-1 truncate">{contactDirectory[id].name}</span>
                  <span className="shrink-0 text-tiny text-ink-3">{contactDirectory[id].company}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Certificación">
        <CicloDelAgente agentSlug={agent.id} />
      </Section>

      <Section title="Historial de calidad">
        <HistorialCalidad agentSlug={agent.id} />
      </Section>

      <Section title="Simulador">
        <SimuladorAgente agentSlug={agent.id} />
      </Section>

      <Section title="Tarea de prueba">
        <TareaDePrueba agentSlug={agent.id} agentName={agent.name} />
      </Section>

      <Section title="Lo que ha aprendido">
        <RecuerdosRecientes agentSlug={agent.id} agentName={agent.name} />
      </Section>

      <Section title="Reglas aprendidas de tus correcciones">
        <CorreccionesAgente agentSlug={agent.id} agentName={agent.name} />
      </Section>

      <Section title="Créditos">
        <ul aria-label="Créditos por tipo de tarea" className="flex flex-col gap-1 text-small">
          {TIPOS_DE_TAREA_IDS.map((t) => (
            <li key={t} className="flex items-center justify-between gap-2">
              <span>Tarea {NOMBRE_TIPO_TAREA[t].toLowerCase()}</span>
              <span className="font-semibold">{TIPOS_DE_TAREA[t].creditos} créditos</span>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-2 border-t border-glass-border pt-2 text-small">
          <Coins size={16} aria-hidden="true" className="shrink-0" />
          <span>Este mes: <strong>{consumoMes === null ? "—" : `${fmtNumber(consumoMes)} créditos`}</strong></span>
        </p>
      </Section>

      <Section title="Archivos generados">
        <ul className="flex flex-col gap-2">
          {profile.files.map((f) => {
            const Icon = fileIcon[f.kind];
            return (
              <li key={f.name} className="flex items-center gap-2 text-small">
                <Icon size={16} aria-hidden="true" className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-tiny text-ink-3">{f.when}</span>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
