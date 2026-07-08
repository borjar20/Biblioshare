import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "./theme-toggle";

export async function Header() {
  const t = await getTranslations();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle();
    username = profile?.username ?? null;
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Biblioshare
        </Link>
        {user && (
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/buscar" className="hover:text-foreground">
              {t("search.title")}
            </Link>
            <Link href="/estadisticas" className="hover:text-foreground">
              {t("stats.navLabel")}
            </Link>
            {username && (
              <Link href={`/u/${username}`} className="hover:text-foreground">
                @{username}
              </Link>
            )}
          </nav>
        )}
      </div>
      <ThemeToggle />
    </header>
  );
}
