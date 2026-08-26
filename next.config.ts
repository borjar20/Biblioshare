import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Cabeceras de seguridad (auditoría 2026-08, hallazgo S2-08). Antes no había
// NINGUNA: la app era enmarcable en un iframe ajeno (clickjacking sobre acciones
// destructivas, que además son de un clic) y no existía ninguna capa de
// defensa-en-profundidad ante una inyección futura.
//
// La CSP es DELIBERADAMENTE parcial: no declara `default-src`, `script-src` ni
// `style-src`. Una CSP estricta de scripts exige `nonce` por petición, y el
// nonce obliga a render dinámico — incompatible con `cacheComponents` (el shell
// estático se prerenderiza en build, cuando ese nonce todavía no existe). Lo que
// sí se puede cerrar sin nonce se cierra aquí; el `script-src` con nonce queda
// como issue aparte, atada a la fase de Cache Components (#448).
//
// `upgrade-insecure-requests` se omite a propósito: en `next dev` sobre
// http://localhost:3000 haría que el navegador intentase subir a HTTPS los
// recursos propios. HSTS ya cubre el transporte en producción.
//
// `Permissions-Policy` no lista `camera`: el escáner de códigos de barras es el
// plugin NATIVO de Capacitor (@capacitor-mlkit/barcode-scanning) y no se ha
// podido verificar en dispositivo que la política del documento no le afecte.
// No se restringe lo que no se puede probar.
//
// `microphone=(self)`, no `()`: las notas de voz graban con getUserMedia desde
// el propio origen (composer de comentarios). `microphone=()` bloqueaba el
// micro AUNQUE el usuario tuviera el permiso concedido — el navegador rechaza
// getUserMedia por política del documento antes de mirar el permiso (se coló
// al cruzarse la auditoría de cabeceras con la rama de notas de voz).
const CSP = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Duplica `frame-ancestors` para los navegadores que aún no leen CSP nivel 2.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(self), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Cache Components (Fase 4, #448): habilita `use cache` + PPR por defecto.
  // Clave de nivel superior en Next 16, NO bajo `experimental`.
  cacheComponents: true,
  // Instant Navigation (Fase 5, #448): un App Shell prefetcheado por RUTA en
  // vez de un prefetch por enlace visible; params/searchParams se rellenan al
  // navegar. Requiere cacheComponents. Las rutas que leen cookies() cachean su
  // shell por sesión en el cliente (doc partialPrefetching.md). No había
  // ningún <Link prefetch={true}> heredado que auditar (auditoría #448).
  partialPrefetching: true,
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
