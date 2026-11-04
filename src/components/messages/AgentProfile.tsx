"use client";

import { Coins, FileImage, FileSpreadsheet, FileText, LifeBuoy, Mail } from "lucide-react";
import { TareaDePrueba } from "@/components/agents/TareaDePrueba";
import { EmailQuota } from "@/components/emails/EmailQuota";
import { contactDirectory, contactsOfAgent } from "@/data/emails";
import { useApprovals } from "@/components/ApprovalsProvider";
import { Avatar, PillButton, StatusBadge, departmentMeta } from "@/components/glass";
import type { OfficeAgent } from "@/data/departments";
import { expertFor } from "@/data/experts";
import { getAgentProfile, type AgentFile } from "@/data/messages";

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

      <Section title="Tarea de prueba">
        <TareaDePrueba agentSlug={agent.id} />
      </Section>

      <Section title="Coste medio por tarea">
        <p className="flex items-center gap-2 text-small">
          <Coins size={16} aria-hidden="true" />
          {profile.avgCostPerTask.toLocaleString("es-ES", { minimumFractionDigits: 1 })} créditos
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
