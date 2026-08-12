"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  monthGrid,
  marksByDate,
  type CalendarMark,
} from "@/lib/clubs/activities/calendar-marks";
import { BellIcon } from "@/components/ui/icons";
import { MARK_ACCENT, accentKeyFor } from "./mark-accent";
import { markLabel } from "./mark-label";
import { DaySheet } from "./day-sheet";

const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
const DIAS_LARGOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Tope de chips por celda. Sin esto, un día con cinco hitos rompe la altura de
// la fila y descuadra la semana entera.
const MAX_CHIPS = 3;

export function MonthGrid({
  month,
  marks,
  today,
}: {
  month: string;
  marks: CalendarMark[];
  today: string;
}) {
  const t = useTranslations("activity");
  const cells = monthGrid(month);
  const byDate = marksByDate(marks);
  // El día cuya hoja está abierta. null = cerrada.
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  // monthGrid rellena SIEMPRE a múltiplo de 7, así que las semanas salen enteras
  // (necesario para envolverlas en role="row" sin celdas sueltas, #147).
  const semanas: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) semanas.push(cells.slice(i, i + 7));

  return (
    // La hoja del día (DaySheet) se monta fuera de la rejilla, como hermana del
    // <div role="grid">: es una sola instancia compartida por todas las
    // celdas, no una por celda.
    <>
    {/* role="grid" + row/columnheader/gridcell: un lector de pantalla asocia cada
        día con su columna y recorre el mes por semanas en vez de como 42 celdas
        planas (#147). Las filas van con `contents` (display:contents) para NO
        romper el `grid grid-cols-7`: las celdas siguen siendo sus items directos,
        así que el aspect-square/min-h por breakpoint se mantiene intacto. */}
    <div
      role="grid"
      aria-label={t("calendarGridLabel")}
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <div role="row" className="grid grid-cols-7 border-b border-border bg-surface-muted">
        {DIAS_CORTOS.map((corto, i) => (
          <div
            key={corto}
            role="columnheader"
            aria-label={DIAS_LARGOS[i]}
            className="py-2 text-center font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase"
          >
            <span className="lg:hidden">{corto}</span>
            <span className="hidden lg:inline">{DIAS_LARGOS[i]}</span>
          </div>
        ))}
      </div>

      <div role="rowgroup" className="grid grid-cols-7">
        {semanas.map((semana) => (
          <div key={semana[0].date} role="row" className="contents">
            {semana.map((cell) => {
          const delDia = byDate.get(cell.date) ?? [];
          const esHoy = cell.date === today;
          const visibles = delDia.slice(0, MAX_CHIPS);
          const conMarcas = delDia.length > 0;
          // La celda NO es `aspect-square`. Un grid item con `aspect-ratio`
          // calcula su tamaño mínimo automático desde el ratio (transferred
          // size suggestion), no desde su contenido: la altura queda clavada al
          // ancho y lo que no cabe se DERRAMA por debajo del borde -- que es el
          // fallo que se reportó (un día con dos glifos + campana envuelve a dos
          // líneas y se sale de su casilla).
          //
          // Con `min-h` la altura la fija el contenido, y como las filas son
          // `display:contents` todas las celdas comparten pista de grid: crece
          // la FILA ENTERA a la vez, sin escalones dentro de la semana.
          const claseCelda = `flex min-h-[3.25rem] min-w-0 flex-col border-r border-b border-border last:border-r-0 sm:min-h-[4.5rem] lg:min-h-[112px] ${
            cell.outside ? "bg-surface-muted/50" : ""
          }`;
          // El relleno vive en el interior, no en la celda: así el área pulsable
          // del botón llega hasta el borde en vez de dejar un marco muerto.
          const claseInterior = "flex min-w-0 flex-1 flex-col gap-1 p-1.5 text-left lg:p-2";
          const contenido = (
            <>
              <span
                className={`self-start rounded-md px-1.5 py-0.5 text-xs leading-none font-semibold ${
                  esHoy
                    ? "bg-accent text-accent-foreground"
                    : cell.outside
                      ? "text-foreground-faint"
                      : "text-foreground"
                }`}
              >
                {cell.day}
                {esHoy && <span className="sr-only"> ({t("calendarToday")})</span>}
              </span>

              {/* Móvil: el GLIFO de la clase, no un punto de color. Un punto de
                  6 px obligaba a distinguir por tono —imposible para quien no
                  lo afina— y además contradecía a la leyenda, que habla de
                  iconos. Es la MISMA silueta que el chip de escritorio (#147). */}
              {visibles.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 lg:hidden">
                  {visibles.map((mark, i) => {
                    const accent = MARK_ACCENT[accentKeyFor(mark)];
                    return (
                      <accent.Icon
                        key={`${mark.activityId}-${mark.markKind}-${i}`}
                        aria-hidden
                        className={`h-2.5 w-2.5 shrink-0 ${accent.text}`}
                      />
                    );
                  })}
                  {/* La campana del día va una sola vez, no por marca: con
                      glifos de 10 px pegados, una campana por marca deja la
                      celda ilegible -- justo lo que se viene a arreglar. Por lo
                      mismo desaparece el anillo que rodeaba el punto seguido:
                      alrededor de un glifo es ruido, y la campana ya lo dice. */}
                  {visibles.some((m) => m.followedByViewer) && (
                    <BellIcon className="h-2 w-2 shrink-0 text-accent" filled aria-hidden />
                  )}
                  {delDia.length > MAX_CHIPS && (
                    <span className="font-mono text-[8px] leading-none text-muted-foreground">
                      {t("calendarMore", { count: delDia.length - MAX_CHIPS })}
                    </span>
                  )}
                </div>
              )}

              <div className="hidden min-w-0 flex-col gap-0.5 lg:flex">
                {visibles.map((mark, i) => {
                  const accent = MARK_ACCENT[accentKeyFor(mark)];
                  return (
                    <span
                      key={`${mark.activityId}-${mark.markKind}-${i}`}
                      title={`${markLabel(mark, t)} · ${mark.title}`}
                      className={`flex items-center gap-1 truncate rounded-chip border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight ${accent.bgSoft} ${accent.border}`}
                    >
                      {/* Glifo de la CLASE de marca: forma, no color. En escala de
                          grises un `evento` (calendario) y un `cierre` (check) se
                          distinguen sin depender del tono, y es la MISMA silueta que
                          la leyenda (#147). Antes la clase solo vivía en `title`, que
                          ni el teclado ni el táctil alcanzan. El color va en el icono
                          (objeto gráfico), no en el título. */}
                      <accent.Icon className={`h-2.5 w-2.5 shrink-0 ${accent.text}`} aria-hidden />
                      {/* La campana es FORMA, no color: en escala de grises el día
                          seguido sigue distinguiéndose del que no (§17). */}
                      {mark.followedByViewer && (
                        <BellIcon
                          className="h-2.5 w-2.5 shrink-0 text-accent"
                          filled
                          aria-hidden
                        />
                      )}
                      {/* El lector de pantalla oye la clase también en escritorio;
                          el chip solo mostraba el título visible. */}
                      <span className="sr-only">{markLabel(mark, t)}: </span>
                      {/* text-foreground (>10:1), no el token: da AA a 11px donde el
                          token no llegaba. `line-through` marca lo pasado sin bajar
                          contraste (opacity-50 tumbaba TODOS los pares, #147). */}
                      <span className={`truncate text-foreground${mark.past ? " line-through" : ""}`}>
                        {mark.title}
                      </span>
                      {mark.followedByViewer && (
                        <span className="sr-only">{t("eventFollowedBadge")}</span>
                      )}
                    </span>
                  );
                })}
                {delDia.length > MAX_CHIPS && (
                  <span className="px-1.5 font-mono text-[9.5px] text-muted-foreground">
                    {t("calendarMore", { count: delDia.length - MAX_CHIPS })}
                  </span>
                )}
              </div>

              {/* Lectores de pantalla: el recuento del día, que los puntos
                  truncados no transmiten. Solo en móvil: en escritorio los
                  chips ya llevan el texto y esto duplicaría el anuncio. */}
              {delDia.length > 0 && (
                <span className="sr-only lg:hidden">
                  {delDia
                    .map(
                      (m) =>
                        `${markLabel(m, t)}: ${m.title}${
                          m.followedByViewer ? `. ${t("eventFollowedBadge")}` : ""
                        }`,
                    )
                    .join(". ")}
                </span>
              )}
            </>
          );

          // El <button> va DENTRO del gridcell, no ES el gridcell: `role` no se
          // suma, sustituye. Un `<button role="gridcell">` deja de anunciarse
          // como pulsable, que es justo la capacidad que esta tarea añade -- se
          // perdería para quien usa lector de pantalla, que es quien más la
          // necesita (los glifos de la celda no dan el título). Así el árbol de
          // accesibilidad conserva las dos cosas: la celda de la rejilla (#147)
          // y el control que la abre.
          //
          // Y el gridcell es la CAJA (bordes, alto), no un `contents`: con
          // `contents` el botón pasaba a ser hijo único de su envoltorio, así
          // que `last:border-r-0` se cumplía en las SIETE celdas y la rejilla se
          // quedaba sin líneas verticales. Ahora `:last-child` vuelve a ser el
          // domingo, que es lo que la clase quería decir.
          return (
            <div key={cell.date} role="gridcell" className={claseCelda}>
              {conMarcas ? (
                <button
                  type="button"
                  // La hoja es de MÓVIL: en escritorio el chip ya lleva el
                  // texto. El botón se queda (no estorba) pero no abre nada
                  // desde `lg`.
                  onClick={() => {
                    if (window.matchMedia("(min-width: 1024px)").matches) return;
                    setDiaAbierto(cell.date);
                  }}
                  className={claseInterior}
                >
                  {contenido}
                </button>
              ) : (
                <div className={claseInterior}>{contenido}</div>
              )}
            </div>
          );
            })}
          </div>
        ))}
      </div>
    </div>

    <DaySheet
      date={diaAbierto}
      marks={diaAbierto ? (byDate.get(diaAbierto) ?? []) : []}
      onClose={() => setDiaAbierto(null)}
    />
    </>
  );
}
