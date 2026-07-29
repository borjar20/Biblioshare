import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// Un cliente NUEVO por llamada, igual que siempre. Construirlo no cuesta red:
// lo caro es `auth.getUser()`, y eso sí se memoiza abajo.
//
// Se intentó envolver esto también en `cache()` y se dio marcha atrás. Motivo
// honesto: durante esa prueba `e2e/happy-path.spec.ts` salió en rojo (`/u/...`
// devolvía 404 con la cabecera bien pintada, o sea la consulta de la página no
// veía sesión y la de AppShell sí), pero NO quedó demostrado que la causa fuera
// compartir el cliente — el rojo también coincidía con un servidor de dev en
// frío, y no se aisló cuál de las dos cosas mandaba. Se optó por lo
// conservador: sin memoizar, el comportamiento es exactamente el de antes y no
// se introduce ningún acoplamiento nuevo entre componentes que corren en
// paralelo. Si alguien quiere volver a intentarlo, que aísle primero las dos
// variables; hay contexto en el issue #283.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component; safe to ignore
            // because middleware refreshes the session instead.
          }
        },
      },
    }
  );
}

// La sesión del usuario, UNA vez por petición.
//
// `auth.getUser()` no decodifica el JWT en local: hace una llamada de red a
// `/auth/v1/user` para que el servidor de auth lo valide. Como AppShell la
// hacía y después cada página la repetía, toda ruta pagaba DOS viajes de red
// idénticos antes del primer byte (issue #283).
//
// `cache()` de React memoiza POR PETICIÓN (no entre peticiones ni entre
// usuarios): la segunda llamada dentro del mismo render devuelve la promesa de
// la primera. Va sobre ESTA función y no sobre `createClient` a propósito —
// arriba está el porqué.
//
// Usa esto en vez de `supabase.auth.getUser()` en componentes de servidor.
export const getCurrentUser = cache(async () => {
  // Cliente propio: el que se comparte es el RESULTADO, no la instancia.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
