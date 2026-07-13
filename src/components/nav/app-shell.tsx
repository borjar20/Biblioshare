import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  getUnreadCount,
  listNotifications,
} from "@/lib/social/notifications";
import { Header } from "@/components/header";
import { SideNav } from "./side-nav";
import { BottomNav } from "./bottom-nav";

// Chrome de la app. Hace UNA sola lectura de sesión/perfil/notificaciones y se
// la reparte a la topbar y a las dos navs, en vez de que cada pieza consulte
// por su cuenta.
export async function AppShell({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let unreadCount = 0;
  let notifications: Awaited<ReturnType<typeof listNotifications>> = [];

  if (user) {
    const [{ data: profile }, count, list] = await Promise.all([
      supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle(),
      getUnreadCount(supabase, user.id),
      listNotifications(supabase, user.id),
    ]);
    username = profile?.username ?? null;
    unreadCount = count;
    notifications = list;
  }

  // Sin username todavía no hay a dónde navegar (el usuario está en
  // onboarding): se muestra la topbar sola.
  const showNav = Boolean(username);

  return (
    <div className="flex flex-1">
      {showNav && <SideNav username={username as string} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          loggedIn={Boolean(user)}
          unreadCount={unreadCount}
          notifications={notifications}
        />
        <div className="flex flex-1 flex-col">{children}</div>
        {showNav && <BottomNav username={username as string} />}
      </div>
    </div>
  );
}
