"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { shiftMonth } from "@/lib/stats/dates";
import {
  agendaForMonth,
  parseMonthParam,
  ORDEN_MARCA,
  type CalendarMark,
  type CalendarMarkKind,
} from "@/lib/clubs/activities/calendar-marks";
import { formatMonthYear } from "@/lib/clubs/activities/format-date";
import { EventForm } from "@/components/clubs/propose/event-form";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { MonthGrid } from "./month-grid";
import { AgendaList } from "./agenda-list";
import { MARK_ACCENT } from "./mark-accent";

// La leyenda se deriva de las claves de MARK_ACCENT (un Record sobre
// CalendarMarkKind, así que un tipo de marca nuevo rompe la compilación allí en
// vez de quedar omitido en silencio aquí), ordenada por el MISMO ORDEN_MARCA que
// desempata las marcas del mismo día en la rejilla. Se importa en vez de
// copiarse: dos constantes gemelas en dos ficheros acaban divergiendo, y la
// leyenda contradiría a la rejilla sin que nada avisara.
const CLASES_LEYENDA = (Object.keys(MARK_ACCENT) as CalendarMarkKind[]).sort(
  (a, b) => ORDEN_MARCA[a] - ORDEN_MARCA[b],
);

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
}: {
  marks: CalendarMark[];
  today: string;
  clubId: string;
  canModerate: boolean;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creando, setCreando] = useState(false);

  const month = parseMonthParam(searchParams.get("mes"), today);
  const agenda = agendaForMonth(marks, month, today);

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

            <div className="flex flex-wrap gap-3 lg:ml-auto">
              {CLASES_LEYENDA.map((markKind) => (
                <span
                  key={markKind}
                  className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase"
                >
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${MARK_ACCENT[markKind].bar}`}
                  />
                  {t(`markKind_${markKind}`)}
                </span>
              ))}
            </div>
          </div>

          <MonthGrid month={month} marks={marks} today={today} />
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-[96px]">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("calendarAgenda")}
          </h2>
          <AgendaList marks={agenda} />
        </aside>
      </div>
    </div>
  );
}
