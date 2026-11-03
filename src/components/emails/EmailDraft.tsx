import type { ApprovalEmail } from "@/data/approvals";
import { AttachmentList } from "./parts";

type Props = {
  email: ApprovalEmail;
  from: string;
  subject: string;
  body: string;
  edited: boolean;
  editing: boolean;
  onSubject: (v: string) => void;
  onBody: (v: string) => void;
};

const field =
  "w-full rounded-card border border-glass-border bg-black/30 p-3 text-small text-white outline-none focus-visible:outline-2 focus-visible:outline-white";

/** Vista previa del correo tal como lo recibirá el cliente, o su editor sencillo (asunto y cuerpo). */
export function EmailDraft({ email, from, subject, body, edited, editing, onSubject, onBody }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-black/25 p-4">
      <p className="flex items-center gap-2 text-tiny text-ink-2">
        Borrador del correo
        {edited && <span className="rounded-pill bg-accent/40 px-2 py-0.5 text-white">Editado</span>}
      </p>
      <dl className="flex flex-col gap-1 text-small">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-ink-3">De:</dt>
          <dd>{from}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-ink-3">Para:</dt>
          <dd>
            {email.toName} &lt;{email.toEmail}&gt;
          </dd>
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-3">Asunto:</dt>
            <dd className="font-semibold">{subject}</dd>
          </div>
        )}
      </dl>
      {editing ? (
        <>
          <label className="flex flex-col gap-1 text-small">
            Asunto
            <input value={subject} onChange={(e) => onSubject(e.target.value)} maxLength={120} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-small">
            Cuerpo del correo
            <textarea value={body} onChange={(e) => onBody(e.target.value)} rows={10} className={`${field} resize-y`} />
          </label>
        </>
      ) : (
        <p className="border-t border-glass-border pt-3 text-small whitespace-pre-line">{body}</p>
      )}
      <AttachmentList items={email.attachments} />
    </div>
  );
}
