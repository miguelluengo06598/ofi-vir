import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // La escena de fondo se sirve en AVIF (o WebP) y al ancho de cada pantalla.
  images: { formats: ["image/avif", "image/webp"] },
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
