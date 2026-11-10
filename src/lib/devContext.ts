/**
 * Empresa y persona de desarrollo, mientras no exista el inicio de sesión (DEV_COMPANY_ID y DEV_USER_ID).
 * En producción devuelve null: sin sesión no se atiende a nadie, para que nunca se sirvan datos de una empresa sin login.
 */
export function devContext(env: Record<string, string | undefined> = process.env): { companyId: string; userId: string } | null {
  if (env.NODE_ENV === "production") return null;
  const companyId = env.DEV_COMPANY_ID?.trim();
  const userId = env.DEV_USER_ID?.trim();
  return companyId && userId ? { companyId, userId } : null;
}
