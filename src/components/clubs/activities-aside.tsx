import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { formatDayMonth } from "@/lib/clubs/activities/format-date";

// Rail derecho de la pestaña Actividades (spec 2026-08-12). NO duplica el de
// Inicio: allí ClubSummary enseña la tira compacta de "qué hace el club ahora";
// aquí van las FECHAS y los contadores, que es contexto de la vista completa.
//
// Cada módulo se oculta solo si no tiene dato, y si no queda ninguno el
// componente devuelve null para que la columna principal se centre en vez de
// dejar un rail con títulos y nada debajo.
export async function ActivitiesAside({
  marks,
  clubSlug,
  activeCount,
  finishedCount,
  memberCount,
}: {
  /** Ya recortadas por quien llama (proximasMarcas). */
  marks: CalendarMark[];
  clubSlug: string;
  activeCount: number;
  finishedCount: number;
  memberCount: number;
}) {
  const t = await getTranslations("activity");
  const hayContadores = activeCount > 0 || finishedCount > 0;
  if (marks.length === 0 && !hayContadores) return null;

  return (
    <aside className="hidden flex-col gap-5 lg:sticky lg:top-[96px] lg:flex">
      {marks.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 shadow-card">
          <h2 className="label-section">{t("asideDates")}</h2>
          {marks.map((mark) => {
            const { day, month } = formatDayMonth(mark.date);
            return (
              <div key={`${mark.date}-${mark.activityId}-${mark.markKind}`} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {day} {month}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {mark.title}
                </span>
              </div>
            );
          })}
          <Link
            href={`/club/${clubSlug}/calendario`}
            className="mt-1 font-mono text-[11px] tracking-wide text-accent uppercase"
          >
            {t("summarySeeCalendar")}
          </Link>
        </section>
      )}

      {hayContadores && (
        <section className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4 shadow-card">
          <h2 className="mb-1 label-section">{t("asideClub")}</h2>
          {activeCount > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {t("asideActive", { count: activeCount })}
            </p>
          )}
          {finishedCount > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {t("asideFinished", { count: finishedCount })}
            </p>
          )}
          <p className="text-[13px] text-muted-foreground">
            {t("asideMembers", { count: memberCount })}
          </p>
        </section>
      )}
    </aside>
  );
}
