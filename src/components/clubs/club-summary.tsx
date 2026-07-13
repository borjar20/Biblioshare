import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import type { UpcomingCheckpoint } from "@/lib/clubs/activities/upcoming";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

// `2026-07-18` → { day: "18", month: "jul" }. Se parte la cadena a mano en vez
// de usar new Date(): un `date` de Postgres no tiene zona, y pasarlo por Date
// lo interpreta como UTC y puede retroceder un día según dónde estés.
function formatDue(dueOn: string): { day: string; month: string } {
  const [, month, day] = dueOn.split("-");
  return { day, month: MONTHS[Number(month) - 1] ?? "" };
}

// Lo primero que ve un miembro al entrar al club: qué hay en marcha y qué toca
// pronto. Sin esto, el feed abre directamente en la conversación y las
// actividades quedan enterradas en otra pestaña.
export async function ClubSummary({
  activities,
  upcoming,
  clubSlug,
}: {
  activities: ClubActivity[];
  upcoming: UpcomingCheckpoint[];
  clubSlug: string;
}) {
  const t = await getTranslations("activity");
  const active = activities.filter((a) => a.status === "active");

  if (active.length === 0 && upcoming.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card">
      {active.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("summaryActive")}
          </h2>

          <div className="flex flex-col gap-2">
            {active.map((activity) => {
              const accent = ACTIVITY_ACCENT[activity.kind];
              return (
                <Link
                  key={activity.id}
                  href={`/club/${clubSlug}/actividad/${activity.id}`}
                  className="flex items-center gap-2.5 hover:opacity-80"
                >
                  <span
                    aria-hidden
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-chip border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
                  >
                    <accent.Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-serif text-sm font-semibold text-foreground">
                      {activity.title}
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {t(`kind_${activity.kind}`)} ·{" "}
                      {t("participants", { count: activity.participantCount })}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-2.5 border-t border-border pt-4">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("summaryUpcoming")}
          </h2>

          <div className="flex flex-col gap-2">
            {upcoming.map((checkpoint) => {
              const { day, month } = formatDue(checkpoint.dueOn);
              return (
                <Link
                  key={checkpoint.id}
                  href={`/club/${clubSlug}/actividad/${checkpoint.activityId}`}
                  className="flex items-center gap-3 hover:opacity-80"
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-chip bg-surface-muted font-mono leading-none"
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {day}
                    </span>
                    <span className="text-[9px] text-muted-foreground uppercase">
                      {month}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-foreground">
                      {checkpoint.label}
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {checkpoint.activityTitle}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
