import type { MetadataRoute } from "next";
import { headers } from "next/headers";

// La URL base sale de la petición (mismo patrón que (auth)/actions.ts: no hay
// variable de entorno de dominio y el alias de Vercel puede cambiar). En prod
// `x-forwarded-proto` es https; en local da http://localhost, irrelevante para
// un rastreador. Leer cabeceras hace esta ruta dinámica — aceptable: hoy lo son
// las 46 (auditoría #448).
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Todo lo público (catálogo, perfiles, sagas) queda permitido por el
      // allow "/"; aquí solo se excluye lo funcional o privado: panel de
      // admin, API, callbacks de auth, ajustes de cuenta, importador,
      // onboarding, fallback offline, la hoja de sesión de lectura y las
      // pantallas de acceso. Un disallow NO protege privacidad (eso es RLS):
      // solo evita indexar páginas que no son contenido.
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/cuenta/",
        "/importar/",
        "/onboarding/",
        "/offline",
        "/sesion/",
        "/login",
        "/signup",
        "/recuperar",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
