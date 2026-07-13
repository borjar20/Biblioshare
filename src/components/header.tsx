import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "@/components/social/notification-bell";
import type { listNotifications } from "@/lib/social/notifications";
import { Wordmark } from "@/components/ui/wordmark";

// Topbar. Desde el rediseño Paper NO navega: las entradas viven en BottomNav
// (móvil) y SideNav (sm+). Aquí solo quedan la marca (que en sm+ ya la pone
// SideNav) y las acciones globales.
export function Header({
  loggedIn,
  unreadCount,
  notifications,
}: {
  loggedIn: boolean;
  unreadCount: number;
  notifications: Awaited<ReturnType<typeof listNotifications>>;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:px-6">
      <Link
        href="/"
        className="shrink-0 sm:invisible"
      >
        <Wordmark />
      </Link>

      <div className="flex items-center gap-1">
        {loggedIn && (
          <NotificationBell
            initialUnreadCount={unreadCount}
            initialNotifications={notifications}
          />
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
