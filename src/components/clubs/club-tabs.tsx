import Link from "next/link";
import { getTranslations } from "next-intl/server";

export type ClubTab = "feed" | "actividades" | "gestion";

export const CLUB_TABS: ClubTab[] = ["feed", "actividades", "gestion"];

// El club era un scroll único con cabecera + gestión + actividades + feed
// apilados. Tres pestañas: cada una responde a una intención distinta.
export async function ClubTabs({
  active,
  basePath,
  canModerate,
  activityCount,
}: {
  active: ClubTab;
  basePath: string;
  canModerate: boolean;
  /** Nº de propuestas esperando moderación, para el aviso de la pestaña. */
  activityCount?: number;
}) {
  const t = await getTranslations("club.tabs");
  const tabs = canModerate ? CLUB_TABS : CLUB_TABS.filter((x) => x !== "gestion");

  return (
    <div className="flex gap-6 border-b border-border font-mono">
      {tabs.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={`${basePath}?tab=${tab}`}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pb-3 text-xs font-medium tracking-wider uppercase transition-colors ${
              isActive
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tab)}
            {tab === "actividades" && activityCount ? (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] text-accent-foreground">
                {activityCount}
              </span>
            ) : null}
            {/* La marca del handoff para lo que solo ven moderadores. */}
            {tab === "gestion" && (
              <span aria-hidden className="text-[8px] text-muted-foreground">
                ◈
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
