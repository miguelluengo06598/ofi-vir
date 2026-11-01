import { GlassPanel } from "@/components/glass";

export function ViewPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{title}</h1>
      <GlassPanel className="enter max-w-xl p-6">
        <p className="text-body">{description}</p>
        <p className="mt-2 text-small text-ink-2">Esta vista se diseñará en un próximo paso.</p>
      </GlassPanel>
    </div>
  );
}
