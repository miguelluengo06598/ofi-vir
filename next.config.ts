import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // La escena de fondo se sirve en AVIF (o WebP) y al ancho de cada pantalla.
  images: { formats: ["image/avif", "image/webp"] },
  // Cabeceras de seguridad para toda la web: nadie puede incrustarla en un marco (clickjacking), el navegador no
  // adivina tipos de archivo, no se filtra la dirección completa a otras webs y se exige HTTPS. El panel interno y
  // las rutas con sesión, además, no se guardan en ninguna caché compartida.
  async headers() {
    const comunes = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ];
    const privado = [{ key: "Cache-Control", value: "private, no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      { source: "/:path*", headers: comunes },
      { source: "/admin/:path*", headers: privado },
      { source: "/admin", headers: privado },
      { source: "/configuracion-inicial", headers: privado },
    ];
  },
  // «Monedero» y «Créditos» eran la misma vista.
  async redirects() {
    return [
      { source: "/monedero", destination: "/creditos", permanent: false },
      // La web pública reorganizó «Cómo funciona» en Producto y sus secciones.
      { source: "/como-funciona", destination: "/producto", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
