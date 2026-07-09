import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "./theme-toggle";
import { AppLogoIcon, SearchIcon, UserIcon } from "@/components/ui/icons";

export async function Header() {
  const t = await getTranslations();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, role")
      .eq("user_id", user.id)
      .maybeSingle();
    username = profile?.username ?? null;
    isAdmin = profile?.role === "admin";
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
          <nav className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground sm:gap-4">
            <Link
              href="/buscar"
              aria-label={t("search.title")}
              className="inline-flex shrink-0 items-center gap-2 hover:text-foreground"
            >
              <SearchIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{t("search.title")}</span>
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="shrink-0 hover:text-foreground"
              >
                {t("admin.navLabel")}
              </Link>
            )}
            {username && (
              <Link
                href={`/u/${username}`}
                aria-label={`@${username}`}
                className="inline-flex min-w-0 items-center gap-2 hover:text-foreground"
              >
                <UserIcon className="h-4 w-4 shrink-0" />
                <span className="hidden truncate sm:inline">@{username}</span>
              </Link>
            )}
          </nav>
        )}
      </div>
      <ThemeToggle />
    </header>
  );
}
