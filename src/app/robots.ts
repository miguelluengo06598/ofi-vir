import type { MetadataRoute } from "next";

const sitio = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const indexable = process.env.VERCEL_ENV === "production" && Boolean(sitio);

/** Producción indexa; desarrollo y previews se excluyen siempre de buscadores. */
export default function robots(): MetadataRoute.Robots {
  if (!indexable) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/", "/login/", "/registro/", "/_laboratorio/"] }, sitemap: `${sitio}/sitemap.xml` };
}
