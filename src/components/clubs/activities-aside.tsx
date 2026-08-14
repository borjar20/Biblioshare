import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { formatDayMonth } from "@/lib/clubs/activities/format-date";

// Si hay algo que este rail pueda enseñar. Se exporta porque quien pinta el
// grid de la pestaña (page.tsx) necesita la MISMA respuesta antes de decidir
// si reserva la columna de 320px -- una pista de grid no desaparece porque su
// hijo pinte null, así que el layout necesita saberlo de antemano, no después.
//
// El recuento de miembros SÍ cuenta como contenido propio: un club siempre
// tiene al menos un miembro (quien mira), así que "Este club" con ese dato
// nunca está realmente vacío, y dejar el rail entero en null cuando activas y
// terminadas son cero ocultaba un dato real que sí tenía algo que decir.
export function hasAsideContent({
  marksCount,
  activeCount,
  finishedCount,
  memberCount,
}: {
  marksCount: number;
  activeCount: number;
  finishedCount: number;
  memberCount: number;
}): boolean {
  return marksCount > 0 || activeCount > 0 || finishedCount > 0 || memberCount > 0;
}

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
  // Ver hasAsideContent: el recuento de miembros cuenta como contenido propio,
  // no solo un adorno de la sección de contadores.
  const hayContadores = activeCount > 0 || finishedCount > 0 || memberCount > 0;
  if (marks.length === 0 && !hayContadores) return null;

  return (
    <aside className="hidden flex-col gap-5 lg:sticky lg:top-[96px] lg:flex">
      {marks.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 shadow-card">
          <h2 className="label-section">{t("asideDates")}</h2>
          {marks.map((mark) => {
            const { day, month } = formatDayMonth(mark.date);
            // "inicio" y "cierre" comparten título con la MISMA actividad --
            // sin distinguirlos, dos filas de "Saltire y Cenizas" (empieza /
            // termina) quedan idénticas e indistinguibles a simple vista.
            const texto =
              mark.markKind === "inicio"
                ? t("asideStarts", { title: mark.title })
                : mark.markKind === "cierre"
                  ? t("asideEnds", { title: mark.title })
                  : mark.title;
            return (
              <div key={`${mark.date}-${mark.activityId}-${mark.markKind}`} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {day} {month}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {texto}
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
          {memberCount > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {t("asideMembers", { count: memberCount })}
            </p>
          )}
        </section>
      )}
    </aside>
  );
}
