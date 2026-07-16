import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "@/components/social/notification-bell";
import type { listNotifications } from "@/lib/social/notifications";
import { Wordmark } from "@/components/ui/wordmark";
import { TopNav } from "@/components/nav/top-nav";
import { UserAvatar } from "@/components/social/user-avatar";

// Topbar. En escritorio ES la navegación (P-T1): wordmark + las cuatro
// entradas + acciones a la derecha, como los frames de escritorio del handoff.
// En móvil se queda en wordmark + acciones, y quien navega es BottomNav.
// El título/acciones contextuales por sección (P-T3) se montarán aquí encima.
export async function Header({
  loggedIn,
  username,
  avatarUrl,
  unreadCount,
  notifications,
}: {
  loggedIn: boolean;
  /** null mientras el usuario no tiene perfil (onboarding): topbar sin nav. */
  username: string | null;
  avatarUrl: string | null;
  unreadCount: number;
  notifications: Awaited<ReturnType<typeof listNotifications>>;
}) {
  const t = await getTranslations("nav.items");

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-6">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>
        {username && <TopNav username={username} />}
      </div>

      <div className="flex items-center gap-1">
        {loggedIn && (
          <NotificationBell
            initialUnreadCount={unreadCount}
            initialNotifications={notifications}
          />
        )}
        <ThemeToggle />
        {/* El avatar es la entrada a Perfil en escritorio. En móvil sobra:
            Perfil ya tiene su sitio en la barra inferior. */}
        {username && (
          <Link
            href={`/u/${username}`}
            aria-label={t("profile")}
            className="ml-1 hidden shrink-0 rounded-full sm:block"
          >
            <UserAvatar name={username} avatarUrl={avatarUrl} size={34} />
          </Link>
        )}
      </div>
    </header>
  );
}
