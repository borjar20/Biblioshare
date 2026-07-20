import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { searchProfiles } from "@/lib/profile/search-profiles";
import { UserAvatar } from "@/components/social/user-avatar";
import { ChevronRightIcon } from "@/components/ui/icons";
import { ResultsEyebrow } from "./results-eyebrow";

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
    <div className="flex flex-col gap-3">
      <ResultsEyebrow count={results.length} />

      <ul className="flex flex-col gap-2">
      {results.map((p) => {
        const name = p.displayName || p.username;
        return (
          <li key={p.username}>
            <Link
              href={`/u/${p.username}`}
              className="flex items-center gap-3 rounded-card border border-border bg-surface shadow-card p-3 hover:bg-surface-muted"
            >
              <UserAvatar name={name} avatarUrl={p.avatarUrl} size={40} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-serif text-sm font-semibold text-foreground">
                  {name}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  @{p.username}
                </span>
              </div>
              {/* Chevron, no el glifo de usuario: el frame 3 marca la fila como
                  navegable hacia el perfil. */}
              <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
