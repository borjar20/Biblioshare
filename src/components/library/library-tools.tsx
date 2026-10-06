import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LibraryToolIcon } from "./library-tool-icon";
import styles from "./library-view.module.css";

const TOOLS = [
  { href: "/notas", key: "notebook", icon: "notebook" },
  { href: "/coleccion/rincon", key: "goalsAndChallenges", icon: "challenges" },
  { href: "/estadisticas", key: "statistics", icon: "statistics" },
] as const;

export async function LibraryTools() {
  const t = await getTranslations("collection");
  return (
    <nav aria-label={t("toolsLabel")} className={`${styles.tools} flex flex-wrap gap-2`}>
      {TOOLS.map(({ href, key, icon }) => (
        <Link
          key={href}
          href={href}
          className={`${styles.tool} inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground`}
        >
          <LibraryToolIcon name={icon} className={styles.pixelIcon} />
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
