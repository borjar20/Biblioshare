import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

// Cliente de servidor SIN sesión: mismas credenciales anónimas, pero SIN leer
// cookies. Es SÍNCRONO a propósito —no hay `await cookies()`— y ese es todo el
// punto: una función que solo use este cliente no toca APIs de request, así que
// no ata la ruta al render dinámico y podrá envolverse en `use cache` (Fase 4 de
// la auditoría #448).
//
// Solo vale para lecturas cuyo resultado es IDÉNTICO para todo el mundo: RLS
// sigue aplicando con rol ANÓNIMO, así que devuelve exactamente lo que ve un
// visitante sin cuenta —el subconjunto público—. Para catálogo, ediciones,
// créditos y sagas eso es todo (esas tablas son `SELECT USING (true)`); para el
// agregado de notas es, por diseño, la media de los perfiles PÚBLICOS (issue
// #436). NUNCA lo uses para datos que dependan de quién mira ni para escribir
// (el rol anónimo no tiene grants de escritura).
export function createPublicClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Sin sesión: no hay cookies que leer ni que escribir.
      cookies: { getAll: () => [], setAll: () => {} },
    }
  );
}

// Cliente CON la identidad del usuario y SIN cookies: el token viaja como
// valor, no como lector diferido.
//
// Existe por `after()` (#751). El cliente de `createClient()` resuelve
// `await cookies()` al construirse, pero le pasa al cliente un adaptador que
// llama a `cookieStore.getAll()` en CADA consulta: pasarlo por closure a un
// callback de `after()` equivale a llamar a `cookies()` dentro del callback, y
// Next 16 lo prohíbe en Server Components. Este cliente lee el token UNA vez,
// durante el render (`getAccessToken`), y a partir de ahí no toca la petición
// para nada — que es literalmente lo que manda la doc de `after`: «read request
// data before `after` […] and pass the values in».
//
// No confundir con `createServiceRoleClient()`: aquí RLS sigue aplicando con la
// identidad del usuario y `auth.uid()` devuelve su id, así que las RPC con
// guard de sesión (p. ej. `register_manual_catalog_item`: `raise 'authentication
// required'` si no hay uid) siguen funcionando igual que desde una server
// action. Ese es el punto — el arreglo no debía relajar ni un grant.
//
// `hydrate_book` YA NO es uno de esos ejemplos, y conviene no volver a citarlo
// aquí: al pasar de fill-only a fill-or-upgrade (`20260883`) perdió el execute
// de `authenticated` y es **solo de `service_role`** (`20260884`, #871), así que
// su guard dejó de ser «hay uid» para ser «quién invoca». Con este cliente
// devuelve 42501. Quien la llama construye su propio cliente de service role
// (ver la cabecera de `hydrate-book.ts`); lo que sigue yendo con ESTE cliente
// son las lecturas y los updates de columnas técnicas.
export function createTokenClient(accessToken: string) {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
}

// El token de acceso de la sesión, leído de las cookies DURANTE el render.
//
// `getSession()` NO hace red (decodifica la cookie), a diferencia de
// `getUser()`; aun así se memoiza por petición por el mismo motivo que
// `getCurrentUser`: la ficha lo pide junto a la sesión y no tiene sentido
// construir dos clientes para lo mismo. Devuelve solo el token, nunca el
// `user` de la sesión — ese no está verificado por el servidor de auth y para
// eso está `getCurrentUser()`.
export const getAccessToken = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
});

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
