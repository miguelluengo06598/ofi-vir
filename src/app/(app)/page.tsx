import { GlassCard } from "@/components/glass";
import { departments } from "@/data/departments";

export default function OficinaPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">Tu oficina</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {departments.map((d) => (
          <GlassCard
            key={d.id}
            department={d.id}
            title={d.title}
            description={d.description}
            tag={d.tag}
          />
        ))}
      </div>
    </div>
  );
}
