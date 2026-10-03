import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NoteIcon, TargetIcon, TiersIcon } from "@/components/ui/icons";

const TOOLS = [
  { href: "/notas", key: "notebook", icon: NoteIcon },
  { href: "/coleccion/rincon", key: "goalsAndChallenges", icon: TargetIcon },
  { href: "/estadisticas", key: "statistics", icon: TiersIcon },
] as const;

export async function LibraryTools() {
  const t = await getTranslations("collection");
  return (
    <nav aria-label={t("toolsLabel")} className="flex flex-wrap gap-2">
      {TOOLS.map(({ href, key, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
        >
          <Icon aria-hidden className="h-4 w-4 shrink-0" />
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
