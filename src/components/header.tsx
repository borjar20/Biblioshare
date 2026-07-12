import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "@/components/social/notification-bell";
import { MobileNav } from "@/components/mobile-nav";
import {
  getUnreadCount,
  listNotifications,
} from "@/lib/social/notifications";
import {
  AppLogoIcon,
  GripVerticalIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
  TrophyIcon,
} from "@/components/ui/icons";

export async function Header() {
  const t = await getTranslations();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let isAdmin = false;
  let unreadCount = 0;
  let notifications: Awaited<ReturnType<typeof listNotifications>> = [];
  if (user) {
    const [{ data: profile }, count, list] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, role")
        .eq("user_id", user.id)
        .maybeSingle(),
      getUnreadCount(supabase, user.id),
      listNotifications(supabase, user.id),
    ]);
    username = profile?.username ?? null;
    isAdmin = profile?.role === "admin";
    unreadCount = count;
    notifications = list;
  }

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-6">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <AppLogoIcon className="h-5 w-5 text-accent" />
          Biblioshare
        </Link>
        {user && (
          <nav className="hidden min-w-0 items-center gap-3 text-sm text-muted-foreground sm:flex sm:gap-4">
            <Link
              href="/buscar"
              className="inline-flex shrink-0 items-center gap-2 hover:text-foreground"
            >
              <SearchIcon className="h-4 w-4" />
              {t("search.title")}
            </Link>
            <Link
              href="/cola"
              className="inline-flex shrink-0 items-center gap-2 hover:text-foreground"
            >
              <GripVerticalIcon className="h-4 w-4" />
              {t("queue.title")}
            </Link>
            <Link
              href="/retos"
              className="inline-flex shrink-0 items-center gap-2 hover:text-foreground"
            >
              <TrophyIcon className="h-4 w-4" />
              {t("challenges.navLabel")}
            </Link>
            <Link
              href="/usuarios"
              className="inline-flex shrink-0 items-center gap-2 hover:text-foreground"
            >
              <UsersIcon className="h-4 w-4" />
              {t("users.navLabel")}
            </Link>
            <Link href="/clubes" className="shrink-0 hover:text-foreground">
              {t("club.navLabel")}
            </Link>
            {isAdmin && (
              <Link href="/admin" className="shrink-0 hover:text-foreground">
                {t("admin.navLabel")}
              </Link>
            )}
            {username && (
              <Link
                href={`/u/${username}`}
                className="inline-flex min-w-0 shrink-0 items-center gap-2 hover:text-foreground"
              >
                <UserIcon className="h-4 w-4" />
                <span className="truncate">@{username}</span>
              </Link>
            )}
          </nav>
        )}
      </div>
      <div className="flex items-center gap-1">
        {user && (
          <>
            <NotificationBell
              initialUnreadCount={unreadCount}
              initialNotifications={notifications}
            />
            <MobileNav username={username} isAdmin={isAdmin} />
          </>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
