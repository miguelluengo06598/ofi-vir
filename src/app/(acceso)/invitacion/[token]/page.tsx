import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { Invitacion } from "@/components/acceso/Invitacion";
import { usuarioActual, supabaseAdmin } from "@/lib/supabase/server";

export const instant = false;

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.length < 20 || token.length > 200) notFound();
  const db = supabaseAdmin();
  const { data } = await db.from("company_invitations").select("email, rol, propietario, companies!inner(name)").eq("token_hash", createHash("sha256").update(token).digest("hex")).is("aceptada_en", null).is("revocada_en", null).gt("caduca_en", new Date().toISOString()).maybeSingle();
  if (!data) notFound();
  const empresa = (data.companies as unknown as { name: string }).name;
  // La invitación de propietario (alta de cliente) lleva rol admin y la marca `propietario`.
  const rol = data.propietario ? "Propietario" : data.rol === "admin" ? "Administración" : "Miembro";
  return <Invitacion token={token} empresa={empresa} rol={rol} haIniciadoSesion={Boolean(await usuarioActual())} />;
}
