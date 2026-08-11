"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { shiftMonth } from "@/lib/stats/dates";
import {
  agendaForMonth,
  parseMonthParam,
  type CalendarMark,
} from "@/lib/clubs/activities/calendar-marks";
import { formatMonthYear } from "@/lib/clubs/activities/format-date";
import { EventForm } from "@/components/clubs/propose/event-form";
import { Button } from "@/components/ui/button";
import { BellIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { MonthGrid } from "./month-grid";
import { AgendaList } from "./agenda-list";
import {
  MARK_ACCENT,
  LEYENDA_MARCAS,
  LEYENDA_EVENTOS,
  LEYENDA_LANZAMIENTOS,
  type MarkAccentKey,
} from "./mark-accent";

// El mes visible vive en el search param `mes`, y se cambia con
// window.history.pushState -- NO con router.push/replace. El App Router
// integra la History API nativa: la URL cambia y useSearchParams se entera,
// pero el server component NO se vuelve a ejecutar. Eso es lo que hace que la
// flecha sea instantánea: todas las marcas del club ya están en memoria.
export function ClubCalendar({
  marks,
  today,
  clubId,
  canModerate,
  viewerIsMember,
}: {
  marks: CalendarMark[];
  today: string;
  clubId: string;
  canModerate: boolean;
  viewerIsMember: boolean;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creando, setCreando] = useState(false);
  // «Sigues» filtra la AGENDA, no la rejilla: la rejilla es el mapa del mes y
  // vaciarla dejaría al usuario sin contexto de qué más hay. Es estado local y no
  // un search param porque no es un enlace que nadie vaya a compartir.
  const [soloSeguidos, setSoloSeguidos] = useState(false);

  const month = parseMonthParam(searchParams.get("mes"), today);
  const agendaDelMes = agendaForMonth(marks, month, today);
  const seguidosDelMes = agendaDelMes.filter((m) => m.followedByViewer);
  const agenda = soloSeguidos ? seguidosDelMes : agendaDelMes;

  function irAlMes(destino: string) {
    // Sin esta guarda, pulsar "Hoy" estando ya en el mes actual apila una
    // entrada de historial idéntica: el usuario pulsa atrás y no ve pasar nada.
    if (destino === month) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("mes", destino);
    window.history.pushState(null, "", `?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-xl font-semibold text-foreground lg:sr-only">
          {t("calendarTitle")}
        </h1>
        {canModerate && !creando && (
          <Button type="button" onClick={() => setCreando(true)}>
            {t("newEvent")}
          </Button>
        )}
      </div>

      {creando && (
        <EventForm
          clubId={clubId}
          onDone={(startsOn) => {
            setCreando(false);
            // Si el evento creado cae fuera del mes visible, saltar a su mes
            // es la única señal de que algo ha pasado: si no, el formulario
            // se cierra, las marcas se refrescan, y el usuario -- que sigue
            // viendo el mes de antes -- no ve ningún cambio.
            if (startsOn) {
              irAlMes(startsOn.slice(0, 7));
            }
            // Las marcas son props del server component: hay que releerlas.
            // Es una acción rara (crear un evento), así que el viaje al
            // servidor aquí no compromete la fluidez de las flechas.
            router.refresh();
          }}
          onCancel={() => setCreando(false)}
        />
      )}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-7">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label={t("calendarPrevMonth")}
              onClick={() => irAlMes(shiftMonth(month, -1))}
              className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>

            <span
              data-testid="calendar-month"
              className="font-serif text-[22px] font-semibold whitespace-nowrap text-foreground"
            >
              {formatMonthYear(month)}
            </span>

            <button
              type="button"
              aria-label={t("calendarNextMonth")}
              onClick={() => irAlMes(shiftMonth(month, 1))}
              className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => irAlMes(today.slice(0, 7))}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              {t("calendarToday")}
            </button>

            {/* Tres filas, no una tira de ocho: "qué clase de marca es", "qué
                clase de evento es" y "de qué medio es el lanzamiento" son tres
                preguntas, y mezcladas en una línea envuelven en móvil. Las tres
                se DERIVAN de las claves de MARK_ACCENT, así que una clave nueva
                aparece sola en su sitio. */}
            <div className="flex flex-col gap-1.5 lg:ml-auto lg:items-end">
              <div className="flex flex-wrap items-center gap-3">
                <LegendLabel>{t("legendMarks")}</LegendLabel>
                {LEYENDA_MARCAS.map((key) => (
                  <LegendItem key={key} accentKey={key} t={t} />
                ))}
                {/* La marca de seguido también en la LEYENDA, no solo en la
                    rejilla (§17): un icono nuevo en las celdas sin nada que lo
                    explique obliga a adivinar qué significa. Solo se pinta si
                    hay algo seguido este mes -- una leyenda para un símbolo que
                    no aparece es ruido. */}
                {viewerIsMember && seguidosDelMes.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-accent uppercase">
                    <BellIcon className="h-2.5 w-2.5" aria-hidden />
                    {t("eventFollowedBadge")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <LegendLabel>{t("legendEvents")}</LegendLabel>
                {LEYENDA_EVENTOS.map((key) => (
                  <LegendItem key={key} accentKey={key} t={t} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <LegendLabel>{t("legendPremieres")}</LegendLabel>
                {LEYENDA_LANZAMIENTOS.map((key) => (
                  <LegendItem key={key} accentKey={key} t={t} />
                ))}
              </div>
            </div>
          </div>

          <MonthGrid month={month} marks={marks} today={today} />
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-[96px]">
          <h2 className="label-section">{t("calendarAgenda")}</h2>

          {/* El filtro solo aparece si hay algo que filtrar: un conmutador
              «Sigues · 0» permanente sería un control que nunca hace nada. */}
          {viewerIsMember && seguidosDelMes.length > 0 && (
            <div
              role="tablist"
              aria-label={t("agendaFilterLabel")}
              className="inline-flex w-fit overflow-hidden rounded-lg border border-border bg-surface"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!soloSeguidos}
                onClick={() => setSoloSeguidos(false)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  soloSeguidos
                    ? "text-muted-foreground hover:text-foreground"
                    : "bg-accent font-medium text-accent-foreground"
                }`}
              >
                {t("agendaFilterAll")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={soloSeguidos}
                onClick={() => setSoloSeguidos(true)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  soloSeguidos
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("agendaFilterFollowed", { count: seguidosDelMes.length })}
              </button>
            </div>
          )}

          <AgendaList
            marks={agenda}
            viewerIsMember={viewerIsMember}
            emptyMessage={soloSeguidos ? t("agendaFollowedEmpty") : undefined}
          />
        </aside>
      </div>
    </div>
  );
}

function LegendLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9.5px] tracking-wide text-foreground-faint uppercase">
      {children}
    </span>
  );
}

function LegendItem({
  accentKey,
  t,
}: {
  accentKey: MarkAccentKey;
  t: (key: string) => string;
}) {
  const accent = MARK_ACCENT[accentKey];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
      {/* Glifo (forma + color), no un punto de color: es la MISMA silueta que el
          chip de la rejilla, así el que no distingue los tonos empareja
          leyenda↔chip por la forma (#147). */}
      <accent.Icon className={`h-2.5 w-2.5 ${accent.text}`} aria-hidden />
      {t(`markAccent_${accentKey}`)}
    </span>
  );
}
