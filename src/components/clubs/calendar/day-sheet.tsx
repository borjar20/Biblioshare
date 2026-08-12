"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { formatEventDate } from "@/lib/clubs/activities/format-date";
import { BellIcon, XIcon } from "@/components/ui/icons";
import { MARK_ACCENT, accentKeyFor } from "./mark-accent";
import { markLabel } from "./mark-label";

// Al tocar un día del calendario en MÓVIL se abre esta hoja con TODAS sus
// marcas. Dos motivos: la celda solo cabe tres glifos y esconde el resto tras un
// «+N» que no dice cuáles (issue #583), y un glifo de 10 px identifica la clase
// pero no el título.
//
// Solo móvil: en escritorio el chip ya lleva el texto, y montar la hoja allí
// sería una segunda superficie que mantener sincronizada con la primera.
//
// <dialog> nativo, mismo patrón que list-challenge/item-connect-sheet.tsx: trae
// foco atrapado, Escape y backdrop sin escribirlos a mano.
export function DaySheet({
  date,
  marks,
  onClose,
}: {
  /** null = cerrada. El día que se está mirando, en ISO YYYY-MM-DD. */
  date: string | null;
  marks: CalendarMark[];
  onClose: () => void;
}) {
  const t = useTranslations("activity");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (date && !dialog.open) dialog.showModal();
    if (!date && dialog.open) dialog.close();
  }, [date]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label={date ? formatEventDate(date) : undefined}
      // `m-auto` no es decorativo: el UA centra un <dialog> modal con
      // `inset: 0; margin: auto`, y el preflight de Tailwind v4 pone `margin: 0`
      // a TODO, así que el centrado del navegador se pierde y la hoja se pega
      // arriba (medido: 0 px de hueco arriba, 563 px abajo). Hay que devolverlo
      // a mano.
      //
      // El ancho deja un respiro lateral (`calc(100% - 2rem)`) en vez de pegarse
      // a los bordes, y la altura se topa para que un día con muchas marcas
      // scrollee DENTRO de la hoja en lugar de salirse de la pantalla.
      className="m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-card border border-border bg-surface p-0 text-foreground backdrop:bg-scrim"
    >
      {date && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-lg leading-tight font-semibold">
              {formatEventDate(date)}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("daySheetClose")}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <ul className="flex flex-col gap-2">
            {marks.map((mark, i) => {
              const accent = MARK_ACCENT[accentKeyFor(mark)];

              const inner = (
                <>
                  <span
                    className={`mb-1 inline-flex w-fit items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[9px] tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
                  >
                    <accent.Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    {markLabel(mark, t)}
                    {mark.followedByViewer && (
                      <>
                        <BellIcon className="h-2.5 w-2.5 text-accent" aria-hidden />
                        <span className="sr-only">{t("eventFollowedBadge")}</span>
                      </>
                    )}
                  </span>
                  {/* text-foreground, no el token: a este tamaño el token no
                      llega a 4.5:1 sobre el tinte (#147). */}
                  <span className="block font-serif text-[14.5px] leading-tight font-semibold text-foreground">
                    {mark.title}
                  </span>
                </>
              );

              const clases = `block rounded-card border border-border px-3 py-2 ${
                mark.past ? "opacity-50" : ""
              }`;

              // Un HITO no tiene ficha propia: se comprueba `href`, nunca el kind.
              return (
                <li key={`${mark.activityId}-${mark.markKind}-${i}`}>
                  {mark.href ? (
                    <Link href={mark.href} className={`${clases} hover:bg-surface-muted`}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={clases}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </dialog>
  );
}
