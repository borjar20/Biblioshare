import type { ReactNode } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getUnreadCount } from "@/lib/social/notifications";
import { Header } from "@/components/header";
import { BottomNav } from "./bottom-nav";

// Chrome de la app. Hace UNA sola lectura de sesión/perfil y se la reparte a la
// topbar y a la barra inferior, en vez de que cada pieza consulte por su cuenta.
//
// AppShell envuelve a {children} sin <Suspense> por encima, así que TODO lo que
// espere aquí retrasa el primer byte de CUALQUIER ruta. Por eso solo se queda lo
// que se pinta de verdad en el chrome:
//   - la sesión, vía getCurrentUser() (memoizada: la página ya no la repite)
//   - el perfil (nombre, avatar, onboarding) — decide si hay navegación
//   - el CONTADOR de no leídas — es el badge visible de la campana
// La LISTA de notificaciones ya no se lee aquí: se pedía entera en cada render
// de cada página para un desplegable que la mayoría de las visitas no abre.
// Ahora la pide la campana al abrirse (issue #283).
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  let username: string | null = null;
  let avatarUrl: string | null = null;
  let onboarded = false;
  let unreadCount = 0;

  if (user) {
    const supabase = await createClient();
    const [{ data: profile }, count] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, avatar_url, onboarded_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      getUnreadCount(supabase, user.id),
    ]);
    username = profile?.username ?? null;
    avatarUrl = profile?.avatar_url ?? null;
    onboarded = profile?.onboarded_at != null;
    unreadCount = count;
  }

  // El chrome se pinta cuando el usuario ya está DENTRO de la app, y estar
  // dentro son dos cosas: tener @usuario y haber terminado el onboarding.
  //
  // Antes bastaba con el username porque quien estaba en el onboarding aún no
  // lo tenía. Con el asistente de 3 pasos (spec 2026-07-20) sí lo tiene, y sin
  // esta condición se le pintaba la barra de navegación ENCIMA del asistente:
  // escapatorias a media configuración y el wordmark duplicado.
  const showNav = Boolean(username) && onboarded;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Header
        loggedIn={Boolean(user)}
        username={showNav ? username : null}
        avatarUrl={avatarUrl}
        unreadCount={unreadCount}
      />
      <div className="flex flex-1 flex-col">{children}</div>
      {showNav && <BottomNav username={username as string} />}
    </div>
  );
}
