import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { searchProfiles } from "@/lib/profile/search-profiles";
import { SearchIcon, UserIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Descubrir usuarios — Biblioshare",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function isSupabaseAvatar(url: string): boolean {
  return /\.supabase\.co\/storage\/v1\/object\/public\//.test(url);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("users");
  const query = q?.trim() ?? "";
  const results = query ? await searchProfiles(supabase, query) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <form method="get" className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t("placeholder")}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          {t("submit")}
        </button>
      </form>

      {query && results.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noResults")}</p>
      )}

      <ul className="flex flex-col gap-2">
        {results.map((p) => {
          const name = p.displayName || p.username;
          return (
            <li key={p.username}>
              <Link
                href={`/u/${p.username}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:bg-surface-muted"
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-muted">
                  {p.avatarUrl ? (
                    isSupabaseAvatar(p.avatarUrl) ? (
                      <Image src={p.avatarUrl} alt={name} fill sizes="40px" className="object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatarUrl} alt={name} className="h-full w-full object-cover" />
                    )
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
                      {initials(name)}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{name}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    @{p.username}
                  </span>
                </div>
                <UserIcon className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
