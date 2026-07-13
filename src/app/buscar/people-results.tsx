import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { searchProfiles } from "@/lib/profile/search-profiles";
import { UserIcon } from "@/components/ui/icons";

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

// El antiguo /usuarios, ahora el modo "Personas" de /buscar.
export async function PeopleResults({ query }: { query: string }) {
  const t = await getTranslations("users");
  const supabase = await createClient();
  const results = query ? await searchProfiles(supabase, query) : [];

  if (!query) {
    return <p className="text-sm text-muted-foreground">{t("description")}</p>;
  }

  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noResults")}</p>;
  }

  return (
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
                    <Image
                      src={p.avatarUrl}
                      alt={name}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.avatarUrl}
                      alt={name}
                      className="h-full w-full object-cover"
                    />
                  )
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
                    {initials(name)}
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-serif text-sm font-semibold text-foreground">
                  {name}
                </span>
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
  );
}
