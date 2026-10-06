import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NoteIcon, TargetIcon, TiersIcon } from "@/components/ui/icons";
import styles from "./library-view.module.css";

const TOOLS = [
  { href: "/notas", key: "notebook", icon: NoteIcon, pixelSrc: "/pet/badges/notes.png" },
  { href: "/coleccion/rincon", key: "goalsAndChallenges", icon: TargetIcon, pixelSrc: "/pet/badges/missions.png" },
  { href: "/estadisticas", key: "statistics", icon: TiersIcon, pixelSrc: null },
] as const;

export async function LibraryTools() {
  const t = await getTranslations("collection");
  return (
    <nav aria-label={t("toolsLabel")} className={`${styles.tools} flex flex-wrap gap-2`}>
      {TOOLS.map(({ href, key, icon: Icon, pixelSrc }) => (
        <Link
          key={href}
          href={href}
          className={`${styles.tool} inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground`}
        >
          {pixelSrc ? (
            <Image src={pixelSrc} alt="" width={32} height={32} className={styles.pixelIcon} />
          ) : (
            <Icon aria-hidden className="h-6 w-6 shrink-0 text-accent" />
          )}
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
