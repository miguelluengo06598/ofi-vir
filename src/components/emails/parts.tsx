"use client";

import { File, FileImage, FileSpreadsheet, FileText, Paperclip } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { PillButton } from "@/components/glass";
import type { EmailAttachment } from "@/data/approvals";
import { emailStatusMeta, type EmailStatus } from "@/data/emails";

/** Estado de entrega: icono + texto. */
export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const { label, icon: Icon, tone } = emailStatusMeta[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-tiny font-semibold ${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  );
}

const attachmentIcon = { pdf: FileText, doc: FileText, sheet: FileSpreadsheet, image: FileImage } as const;

export function AttachmentList({ items }: { items?: EmailAttachment[] }) {
  if (!items?.length) return null;
  return (
    <ul aria-label="Adjuntos" className="flex flex-wrap gap-2">
      {items.map((a) => {
        const Icon = attachmentIcon[a.kind] ?? File;
        return (
          <li key={a.name} className="inline-flex max-w-full items-center gap-2 rounded-pill bg-black/25 px-3 py-1.5 text-tiny">
            <Icon size={14} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{a.name}</span>
            <span className="shrink-0 text-ink-2">{a.size}</span>
          </li>
        );
      })}
    </ul>
  );
}

export const PaperclipCount = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="inline-flex items-center gap-1 text-tiny text-ink-2">
      <Paperclip size={12} aria-hidden="true" />
      {count} {count === 1 ? "adjunto" : "adjuntos"}
    </span>
  ) : null;

/** Pestañas accesibles (flechas izquierda/derecha). El contenido va aparte, en un `role="tabpanel"` con `aria-labelledby={tabId(prefix, value)}`. */
export const tabId = (prefix: string, value: string) => `${prefix}-tab-${value}`;

export function Tabs<T extends string>({
  prefix,
  label,
  tabs,
  value,
  onChange,
}: {
  prefix: string;
  label: string;
  tabs: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(i + d + tabs.length) % tabs.length];
    onChange(next.value);
    refs.current[next.value]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-2">
      {tabs.map((t, i) => (
        <PillButton
          key={t.value}
          ref={(el) => {
            refs.current[t.value] = el;
          }}
          id={tabId(prefix, t.value)}
          role="tab"
          aria-selected={value === t.value}
          aria-pressed={undefined}
          tabIndex={value === t.value ? 0 : -1}
          compact
          active={value === t.value}
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.icon}
          {t.label}
        </PillButton>
      ))}
    </div>
  );
}
