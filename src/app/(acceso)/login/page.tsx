import { LoginForm } from "@/components/acceso/FormularioAcceso";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destino = next?.startsWith("/") && !next.startsWith("//") ? next : "/oficina";
  return <LoginForm next={destino} />;
}
