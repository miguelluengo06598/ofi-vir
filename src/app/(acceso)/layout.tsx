import { Background } from "@/components/Background";

export const instant = false;

export default function AccesoLayout({ children }: { children: React.ReactNode }) {
  return <><Background /><main className="flex flex-1 items-center justify-center px-4 py-12">{children}</main></>;
}
