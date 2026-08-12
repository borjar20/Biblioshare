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
import { AgendaColumnsToggle } from "./agenda-columns-toggle";
import { useAgendaColumns } from "./agenda-columns";
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
  // Las columnas de la agenda SÍ sobreviven a la recarga (localStorage): es una
  // preferencia de lectura, no un filtro de esta visita. Ver agenda-columns.ts.
  const [columnas, elegirColumnas] = useAgendaColumns();

  const month = parseMonthParam(searchParams.get("mes"), today);
  const agendaDelMes = agendaForMonth(marks, month, today);
  const seguidosDelMes = agendaDelMes.filter((m) => m.followedByViewer);
  const agenda = soloSeguidos ? seguidosDelMes : agendaDelMes;

  // La marca de «seguido» de la leyenda. Se calcula UNA vez aquí porque la
  // montan las dos ramas de la leyenda (la plegable de móvil y la fija de
  // escritorio), y solo se pinta si hay algo seguido este mes: una leyenda que
  // explica un símbolo que no aparece es ruido. Solo la lleva la PRIMERA fila
  // («marcas»), no las tres.
  const seguidoBadge =
    viewerIsMember && seguidosDelMes.length > 0 ? (
      <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-accent uppercase">
        {/* Rellena, igual que las campanas que explica: una leyenda que dibuja
            otra silueta que el símbolo real no es una leyenda. */}
        <BellIcon className="h-2.5 w-2.5" filled aria-hidden />
        {t("eventFollowedBadge")}
      </span>
    ) : null;

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
          onDone={(_activityId, startsOn) => {
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

            {/* Ancho reservado para el mes MÁS LARGO, centrado dentro. Sin esto
                el ancho del texto manda ("Mayo 2027" mide bastante menos que
                "Septiembre 2027") y las flechas y el botón «Hoy» saltan de sitio
                cada vez que se cambia de mes: se pulsa «siguiente» dos veces y
                el botón ya no está donde estaba el dedo.

                En `em`, no en px: la reserva escala sola si algún día cambia el
                `text-[22px]` de al lado. Y es `min-w`, no `w`: si un locale trae
                un mes más largo, el texto crece en vez de recortarse -- volvería
                a saltar, que es un defecto menor, pero nunca se corta. */}
            <span
              data-testid="calendar-month"
              className="min-w-[8.5em] text-center font-serif text-[22px] font-semibold whitespace-nowrap text-foreground"
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
            {/* La marca de seguido también en la LEYENDA, no solo en la rejilla
                (§17): un icono nuevo en las celdas sin nada que lo explique
                obliga a adivinar qué significa. Solo se pinta si hay algo
                seguido este mes -- una leyenda para un símbolo que no aparece es
                ruido. */}
            {/* Móvil: plegada. Ocupaba ~120 px antes de que empezara la
                rejilla, que es justo el sitio que la rejilla necesita.
                <details> nativo: cero JS, disclosure y teclado de serie. NO
                persiste entre visitas a propósito -- el componente no se
                remonta al cambiar de mes (el mes viaja por pushState), así que
                quien la abre la conserva mientras navega de mes, que es el
                caso real. */}
            <details className="flex flex-col gap-1.5 lg:hidden">
              <summary className="w-fit cursor-pointer font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
                {t("legendToggle")}
              </summary>
              <div className="mt-1.5 flex flex-col gap-1.5">
                <LegendRows t={t} seguidoBadge={seguidoBadge} />
              </div>
            </details>

            {/* Escritorio: siempre abierta y sin disclosure, como hasta hoy. */}
            <div className="hidden lg:ml-auto lg:flex lg:flex-col lg:items-end lg:gap-1.5">
              <LegendRows t={t} seguidoBadge={seguidoBadge} />
            </div>
          </div>

          <MonthGrid month={month} marks={marks} today={today} />
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-[96px]">
          <h2 className="label-section">{t("calendarAgenda")}</h2>

          {/* Filtro y columnas comparten fila: son los dos mandos de la misma
              lista, y apilados se comían una franja de alto en la pantalla donde
              el alto es lo que escasea. El toggle se va a la derecha con
              `ml-auto` para que la posición del filtro no dependa de si el
              toggle está o no. */}
          {/* `lg:contents` disuelve la fila desde `lg`, donde el toggle no se
              pinta: si no, quedaría un contenedor vacío sumando el `gap-3` del
              aside -- una franja de aire bajo el título en escritorio. */}
          <div className="flex flex-wrap items-center gap-2 lg:contents">
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

            {/* Último y con `ml-auto`: así el filtro no cambia de sitio según
                esté o no el toggle. Y no se pinta sobre una agenda vacía: no
                hay nada que recolocar. */}
            {agenda.length > 0 && (
              <div className="ml-auto lg:hidden">
                <AgendaColumnsToggle value={columnas} onChange={elegirColumnas} />
              </div>
            )}
          </div>

          <AgendaList
            marks={agenda}
            viewerIsMember={viewerIsMember}
            columns={columnas}
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

// Las tres filas, sin envoltorio: las montan DOS sitios -- el <details> de móvil
// y el bloque siempre-abierto de escritorio. Extraerlas evita la copia que si no
// haría falta, porque `open` de <details> no tiene variante responsive.
function LegendRows({
  t,
  seguidoBadge,
}: {
  t: (key: string) => string;
  /** La marca de «seguido», que solo se pinta si hay algo seguido este mes. */
  seguidoBadge: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <LegendLabel>{t("legendMarks")}</LegendLabel>
        {LEYENDA_MARCAS.map((key) => (
          <LegendItem key={key} accentKey={key} t={t} />
        ))}
        {seguidoBadge}
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
    </>
  );
}
