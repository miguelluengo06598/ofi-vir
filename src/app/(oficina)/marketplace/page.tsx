import { ViewPlaceholder } from "@/components/ViewPlaceholder";

// El marketplace es una fase futura: su vista se conserva (MarketplaceView) pero no se enseñan agentes ni creadores
// inventados en la oficina de una empresa.
export default function Page() {
  return (
    <ViewPlaceholder
      title="Marketplace"
      description="Próximamente. Por ahora, los agentes de tu oficina los prepara el equipo de MyOfia o los creáis vosotros."
    />
  );
}
