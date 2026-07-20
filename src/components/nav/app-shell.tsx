import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  getUnreadCount,
  listNotifications,
} from "@/lib/social/notifications";
import { Header } from "@/components/header";
import { BottomNav } from "./bottom-nav";

// Chrome de la app. Hace UNA sola lectura de sesión/perfil/notificaciones y se
// la reparte a la topbar y a la barra inferior, en vez de que cada pieza
// consulte por su cuenta.
export async function AppShell({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let avatarUrl: string | null = null;
  let onboarded = false;
  let unreadCount = 0;
  let notifications: Awaited<ReturnType<typeof listNotifications>> = [];

  if (user) {
    const [{ data: profile }, count, list] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, avatar_url, onboarded_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      getUnreadCount(supabase, user.id),
      listNotifications(supabase, user.id),
    ]);
    username = profile?.username ?? null;
    avatarUrl = profile?.avatar_url ?? null;
    onboarded = profile?.onboarded_at != null;
    unreadCount = count;
    notifications = list;
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
        notifications={notifications}
      />
      <div className="flex flex-1 flex-col">{children}</div>
      {showNav && <BottomNav username={username as string} />}
    </div>
  );
}
