import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { MARK_ACCENT, accentKeyFor } from "./calendar/mark-accent";
import { markLabel } from "./calendar/mark-label";
import { formatDayMonth } from "@/lib/clubs/activities/format-date";

// % de tiempo transcurrido entre las fechas de la actividad. Es una barra
// orientativa (el progreso real por hitos costaría una query por actividad);
// aquí Date.parse sobre el date de Postgres vale: un desfase de horas no se ve
// en una barra. Solo se evalúa en servidor — este componente no se hidrata.
function timeProgress(startsOn: string | null, endsOn: string | null): number | null {
  if (!startsOn || !endsOn) return null;
  const start = Date.parse(startsOn);
  const end = Date.parse(endsOn);
  if (!Number.isFinite(start) || !(end > start)) return null;
  const ratio = (Date.now() - start) / (end - start);
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
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
  /** Las próximas marcas del club, ya recortadas por quien llama. */
  upcoming: CalendarMark[];
  clubSlug: string;
}) {
  const t = await getTranslations("activity");
  // Un evento no tiene ficha propia: si entrara aquí, su <Link> a
  // /actividad/:id daría 404. Sus fechas ya se ven en la tira "Próximo" de
  // más abajo (unificada con los hitos), así que quedan fuera de este bloque.
  const active = activities.filter(
    (a) => a.status === "active" && a.kind !== "evento",
  );

  if (active.length === 0 && upcoming.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {active.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="label-section">
            {t("summaryActive")}
          </h2>

          {/* Strip horizontal, como en el handoff: las actividades en marcha
              se hojean de lado, no empujan el feed hacia abajo. */}
          <div className="flex gap-3 overflow-x-auto pb-1">
            {active.map((activity) => {
              const accent = ACTIVITY_ACCENT[activity.kind];
              const progress = timeProgress(activity.startsOn, activity.endsOn);
              return (
                <Link
                  key={activity.id}
                  href={`/club/${clubSlug}/actividad/${activity.id}`}
                  className="flex w-52 shrink-0 flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-card hover:opacity-80"
                >
                  <span
                    className={`inline-flex w-fit items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[9px] tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
                  >
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-[2px] ${accent.bar}`} />
                    {t(`kind_${activity.kind}`)}
                  </span>

                  <span className="truncate font-serif text-sm font-semibold text-foreground">
                    {activity.title}
                  </span>

                  {progress !== null && (
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className={`block h-full rounded-full ${accent.bar}`}
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                  )}

                  <span className="truncate font-mono text-[9.5px] text-muted-foreground">
                    {t("participate", { count: activity.participantCount })}
                    {activity.endsOn && (
                      <>
                        {" · "}
                        {t("untilDate", {
                          date: `${formatDayMonth(activity.endsOn).day} ${formatDayMonth(activity.endsOn).month}`,
                        })}
                      </>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="flex items-center justify-between gap-2 label-section">
            {t("summaryNext")}
            <Link
              href={`/club/${clubSlug}/calendario`}
              className="font-mono text-[9.5px] tracking-wide text-accent normal-case hover:opacity-80"
            >
              {t("summarySeeCalendar")}
            </Link>
          </h2>

          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {upcoming.map((mark, i) => {
              const { day, month } = formatDayMonth(mark.date);
              const accent = MARK_ACCENT[accentKeyFor(mark)];

              const inner = (
                <>
                  <span aria-hidden className="flex shrink-0 flex-col items-center leading-none">
                    <span className="font-serif text-lg font-semibold text-foreground">
                      {day}
                    </span>
                    <span className="font-mono text-[8.5px] text-muted-foreground uppercase">
                      {month}
                    </span>
                  </span>
                  <span className="flex max-w-44 min-w-0 flex-col text-xs leading-tight">
                    <span className="truncate text-foreground">{mark.title}</span>
                    <span className={`truncate ${accent.text}`}>
                      {mark.detail ?? markLabel(mark, t)}
                    </span>
                  </span>
                </>
              );

              const clases =
                "flex shrink-0 items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2";

              // Un evento no tiene ficha: enlazarlo daría 404.
              return mark.href ? (
                <Link key={i} href={mark.href} className={`${clases} hover:opacity-80`}>
                  {inner}
                </Link>
              ) : (
                <div key={i} className={clases}>
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
