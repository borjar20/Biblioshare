import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Goodreads exports include free-text reviews; a few hundred rows can
      // exceed the 1MB default. See docs/REQUIREMENTS.md §7.7.
      bodySizeLimit: "5mb",
    },
  },
  images: {
    // Sin optimizador de Vercel: cada (src, ancho, calidad) única gasta una de
    // las 5.000 transformaciones/mes del plan Hobby y el catálogo las agota
    // solo. El loader pide el tamaño al CDN de origen. Ver src/lib/images/cdn-loader.ts.
    loader: "custom",
    loaderFile: "./src/lib/images/cdn-loader.ts",
    // remotePatterns deja de aplicarse con loader custom, pero se conserva
    // como documentación de los orígenes válidos y por si se revierte.
    remotePatterns: [
      { protocol: "https", hostname: "books.google.com" },
      { protocol: "https", hostname: "books.googleusercontent.com" },
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "covers.openlibrary.org" },
      // Avatares en Supabase Storage (bucket público). Un solo patrón de
      // subdominio cubre los proyectos dev y prod.
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
