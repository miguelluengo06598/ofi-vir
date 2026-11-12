import type { Metadata } from "next";
import { FacebookLeadsView } from "@/components/conexiones/meta/FacebookLeadsView";

export const metadata: Metadata = { title: "Facebook · Páginas y formularios" };

export default function Page() {
  return <FacebookLeadsView />;
}
