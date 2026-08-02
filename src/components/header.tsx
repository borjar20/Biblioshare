import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "@/components/social/notification-bell";
import { Wordmark } from "@/components/ui/wordmark";
import { TopNav } from "@/components/nav/top-nav";
import { UserAvatar } from "@/components/social/user-avatar";
import { buttonVariants } from "@/components/ui/button";

// Topbar. En escritorio ES la navegación (P-T1): wordmark + las cuatro
// entradas + acciones a la derecha, como los frames de escritorio del handoff.
// En móvil se queda en wordmark + acciones, y quien navega es BottomNav.
// El título/acciones contextuales por sección (P-T3) se montarán aquí encima.
export async function Header({
  loggedIn,
  username,
  avatarUrl,
  unreadCount,
}: {
  loggedIn: boolean;
  /** null para el usuario anónimo y durante el onboarding (aún sin perfil): topbar sin nav. */
  username: string | null;
  avatarUrl: string | null;
  unreadCount: number;
}) {
  const t = await getTranslations("nav");

  return (
    // Altura fija (--topbar-h) en vez de crecer con el contenido: las
    // pestañas de la ficha se pegan justo debajo con top-[var(--topbar-h)] y
    // se solaparían si la topbar midiera otra cosa. Ver globals.css.
    <header className="sticky top-0 z-20 flex h-[var(--topbar-h)] items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-6">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>
        {(username || !loggedIn) && <TopNav username={username} />}
      </div>

      <div className="flex items-center gap-1">
        {loggedIn && <NotificationBell initialUnreadCount={unreadCount} />}
        <ThemeToggle />
        {/* El avatar es la entrada a Perfil en escritorio. En móvil sobra:
            Perfil ya tiene su sitio en la barra inferior. */}
        {username && (
          <Link
            href={`/u/${username}`}
            aria-label={t("items.profile")}
            className="ml-1 hidden shrink-0 rounded-full sm:block"
          >
            <UserAvatar name={username} avatarUrl={avatarUrl} size={34} />
          </Link>
        )}
        {!loggedIn && (
          <div className="ml-1 flex items-center gap-2">
            <Link href="/login" className={buttonVariants("ghost", "hidden px-3 py-1.5 text-[13px] sm:inline-flex")}>
              {t("auth.signIn")}
            </Link>
            <Link href="/signup" className={buttonVariants("primary", "px-3 py-1.5 text-[13px]")}>
              {t("auth.signUp")}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
