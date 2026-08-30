import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getUnreadCount } from "@/lib/social/notifications";
import { Header } from "@/components/header";
import { BottomNav } from "./bottom-nav";
import { ChromeGate } from "./chrome-gate";
import { SkipLink } from "./skip-link";

// Chrome de la app. El ARMAZÓN (los divs y dónde va cada barra) es estático y no
// espera a nada; las dos piezas que dependen de la sesión —topbar y barra
// inferior— cuelgan cada una de su <Suspense> con un fallback que reserva su
// altura exacta.
//
// Antes AppShell hacía `await getCurrentUser()` (→ `await cookies()`) SIN boundary
// por encima de {children}, así que el primer byte de CUALQUIER ruta esperaba a
// la sesión y —con cacheComponents— ninguna ruta podía producir shell estático
// (issue #435). Sacar la lectura de sesión a sus boundaries deja el armazón fuera
// del prerender dinámico.
//
// La lectura sigue siendo UNA por petición: getCurrentUser() y getOwnProfile()
// van memoizados con React.cache(), así que aunque SessionChrome y SessionNav la
// pidan por su lado, el viaje de red se hace una sola vez (#283, #456).
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <SkipLink />
      {/* `/partida/activa` se come el marco: es la única pantalla de la app sin
          topbar ni barra de cinco, y ese corte es lo que separa «configurar» de
          «jugar» (#931).
          El gate va DENTRO del `<Suspense>`, no envolviéndolo: lee la ruta con
          `usePathname`, y un hook de cliente sin boundary por encima bloquea el
          prerender de TODA ruta que llegue a prerenderarse (`CLIENT_HOOK_DYNAMIC`) —
          `next build` se cae, aunque `next dev` no diga nada. Dentro del boundary es
          exactamente lo que ya hacía `BottomNav` con `/post/*`. */}
      <Suspense fallback={<HeaderSkeleton />}>
        <ChromeGate>
          <SessionChrome />
        </ChromeGate>
      </Suspense>
      {/* El landmark <main> vive AQUÍ, en el armazón, y no en cada página: así lo
          tienen las 17 rutas de una vez y no hay forma de olvidarlo al crear la
          siguiente (issue #816). Las cuatro páginas que traían su propio <main>
          pasaron a <div> en el mismo cambio — dos <main> anidados son otra
          violación de axe, así que esto es o uno o el otro, nunca los dos.
          `tabIndex={-1}`: sin él, saltar al ancla mueve el punto de tabulación
          pero no el foco en todos los navegadores. */}
      <main id="contenido" tabIndex={-1} className="flex flex-1 flex-col">
        {children}
      </main>
      <Suspense fallback={<BottomNavSkeleton />}>
        <ChromeGate>
          <SessionNav />
        </ChromeGate>
      </Suspense>
    </div>
  );
}

// El chrome se pinta cuando el usuario ya está DENTRO de la app, y estar dentro
// son dos cosas: tener @usuario y haber terminado el onboarding. Con el asistente
// de 3 pasos (spec 2026-07-20) el usuario ya tiene username DURANTE el onboarding,
// así que sin la condición de onboarded se le pintaría la barra de navegación
// ENCIMA del asistente. Ambas barras derivan showNav de aquí para no divergir.
async function readChromeIdentity() {
  // `connection()` declara este subárbol como de PETICIÓN antes de tocar la sesión.
  // Sin él, en una ruta cuyo armazón SÍ llega a prerenderarse (la primera fue
  // /partidas, #931) el chequeo de expiración del token de Supabase —un `Date.now()`
  // dentro de `getCurrentUser`— aborta la ruta con «unstable value Date.now() while
  // prerendering». No saca a nadie del shell estático: topbar y barra inferior ya
  // viven cada una bajo su `<Suspense>` justo para eso (#435).
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, username: null as string | null, avatarUrl: null as string | null, showNav: false };
  }
  // getOwnProfile va memoizado por userId (#456): esta lectura la reutiliza la
  // página. .catch(() => null): getOwnProfile hace throw en error y aquí se
  // tolera —el chrome se pinta sin navegación en vez de tumbar la ruta entera.
  const profile = await getOwnProfile(user.id).catch(() => null);
  const username = profile?.username ?? null;
  const showNav = Boolean(username) && profile?.onboardedAt != null;
  return { user, username, avatarUrl: profile?.avatarUrl ?? null, showNav };
}

// Topbar. Necesita, además de la identidad, el CONTADOR de no leídas —el badge
// visible de la campana—. La LISTA de notificaciones ya no se lee aquí: la pide
// la campana al abrirse (issue #283).
async function SessionChrome() {
  const { user, username, avatarUrl, showNav } = await readChromeIdentity();

  let unreadCount = 0;
  if (user) {
    const supabase = await createClient();
    unreadCount = await getUnreadCount(supabase, user.id);
  }

  return (
    <Header
      loggedIn={Boolean(user)}
      username={showNav ? username : null}
      avatarUrl={avatarUrl}
      unreadCount={unreadCount}
    />
  );
}

// Barra inferior (solo móvil). Se pinta con nav cuando el usuario está dentro, y
// vacía-anónima para el visitante; durante el onboarding (usuario sin showNav) no
// hay barra, igual que antes.
async function SessionNav() {
  const { user, username, showNav } = await readChromeIdentity();

  if (showNav) return <BottomNav username={username as string} />;
  if (!user) return <BottomNav username={null} />;
  return null;
}

// Fallbacks: reservan la altura EXACTA de su barra para no reintroducir el CLS
// que costó el issue #284 (0.51 en móvil). La topbar mide --topbar-h (59px), fijo
// por token, así que un div con esa altura la reserva sin depender del contenido.
function HeaderSkeleton() {
  return (
    <div
      aria-hidden
      className="sticky top-0 z-20 h-[var(--topbar-h)] border-b border-border bg-background/90 backdrop-blur"
    />
  );
}

// Espejo de la caja externa de BottomNav (mismos padding y borde) con una columna
// placeholder dentro (icono h-5 + etiqueta) para reservar la misma altura de fila.
function BottomNavSkeleton() {
  return (
    <div
      aria-hidden
      className="sticky bottom-0 z-20 flex justify-around border-t border-border bg-background/90 px-2 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
    >
      {/* Columna de 39px: icono (h-5) + gap-1 + línea de etiqueta (~15px), la
          altura medida de un item real de BottomNav en móvil. */}
      <div className="flex flex-col items-center gap-1">
        <div className="h-5 w-5" />
        <div className="h-[15px] w-8" />
      </div>
    </div>
  );
}
