"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PillButton } from "@/components/glass";

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <PillButton icon={RefreshCw} disabled={pending} onClick={() => start(() => router.refresh())}>
      {pending ? "Comprobando…" : "Comprobar de nuevo"}
    </PillButton>
  );
}
