"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { intentsFor, primaryAction, type Intent } from "@/lib/passes/pass-actions";
import { Button } from "@/components/ui/button";
import { RatingDots } from "@/components/ui/rating-dots";
import { useItemStatus } from "./item-status-context";
import { usePassActions } from "./pass-actions-provider";
import { useSeriesEpisodes } from "./series-episode-context";
import { PassStatusSelect } from "./pass-status-select";
import styles from "./pass-card.module.css";

// La misma forma para el botón principal con y sin pase (y para las
// intenciones secundarias): la tarjeta cambia de contenido, no de lenguaje.
const PRIMARY_SHAPE = "rounded-[10px]";

export type PassCardProps = {
  itemType: ItemType;
  /** Solo donde hay cursor (libro, serie). La película no lleva barra. */
  progress: { percent: number; left: string; right: string } | null;
  /** Nota propia 1–10 del pase activo. */
  rating: number | null;
  /** Solo series: «Al día» (isUpToDate, src/lib/series/follow-state.ts), que
   *  calcula la ficha con los datos del pase. Es un estado DERIVADO, no una
   *  pastilla más: se marca junto al progreso y PassStatusSelect sigue en «Viendo». */
  upToDate?: boolean;
};

// Controles del pase personal de la obra (spec
// 2026-11-10-ficha-acciones): sin pase ofrece las intenciones («Quiero leerlo»,
// «Lo estoy leyendo», «Ya lo leí»); con pase, el estado se cambia aquí mismo, la
// acción principal depende del estado y la nota se pone sin ir a Mi registro.
// El proveedor del pase resuelve estado y nota. Para series, la capa de
// episodios comparte la acción primaria y el progreso con el explorador.
//
// El botón principal es SIEMPRE el naranja del rol (`bg-accent`, F3-006), no el
// color del tipo de medio: el color de tipo es del CONTENIDO, el del CTA es de
// la acción.
export function PassCard({ itemType, progress: initialProgress, rating, upToDate: initialUpToDate = false }: PassCardProps) {
  const episodes = useSeriesEpisodes();
  const progress = episodes?.progress ?? initialProgress;
  const upToDate = episodes?.upToDate ?? initialUpToDate;
  const t = useTranslations("item");
  const tPasses = useTranslations("passes");
  const tRail = useTranslations("detail.rail");
  const tEpisode = useTranslations("episode");
  const { status, isSaving } = useItemStatus();
  const { isPending, error, addWith, changeStatus, runPrimary, rate } = usePassActions();
  // `isSaving` cuenta también las escrituras de otras islas de la ficha:
  // SeriesFollowCard escribe en su propia transición y solo publica
  // setSaving(true). Sin mirarlo, la tarjeta podría lanzar una segunda
  // escritura de estado a la vez.
  const busy = isPending || isSaving;

  // Nota optimista: los dots cambian al tocar, sin esperar al refresh. Cuando
  // el servidor trae otra nota (la escrita, o la de antes si falló) manda la
  // prop: ajuste durante el render con `prev`, sin efectos.
  const [shownRating, setShownRating] = useState(rating);
  const [prevRating, setPrevRating] = useState(rating);
  if (rating !== prevRating) {
    setPrevRating(rating);
    setShownRating(rating);
  }
  // Si la escritura falla no hay refresh y la prop no cambia: al llegar el
  // error se vuelve a la nota que hay en BD.
  const [prevError, setPrevError] = useState(error);
  if (error !== prevError) {
    setPrevError(error);
    if (error) setShownRating(rating);
  }

  // Foco tras elegir una intención: el estado optimista desmonta los botones
  // de intención y el foco caería a <body>. Se lleva al botón principal, pero
  // solo cuando deja de estar deshabilitado (un botón disabled no recibe foco)
  // y solo si el foco se perdió de verdad: si mientras tanto se abrió la hoja
  // de cierre («Ya lo leí»), el foco es suyo. Si el añadir falla y se vuelve a
  // «sin pase», la marca se olvida. En un efecto que solo llama a .focus(): el
  // foco es del DOM, no estado de React.
  const primaryRef = useRef<HTMLButtonElement>(null);
  const focusPrimaryAfterIntent = useRef(false);
  useEffect(() => {
    if (!focusPrimaryAfterIntent.current || busy) return;
    focusPrimaryAfterIntent.current = false;
    if (!status) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    primaryRef.current?.focus();
  }, [status, busy]);

  const errorLine = error && (
    <p role="alert" className="px-1 text-[13px] text-status-dropped">
      {t(error)}
    </p>
  );

  function chooseIntent(intent: Intent) {
    focusPrimaryAfterIntent.current = true;
    addWith(intent);
  }

  if (!status) {
    const [first, ...rest] = intentsFor(itemType);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => chooseIntent(first)}
          className={`min-h-11 self-start px-4 py-2 font-semibold ${PRIMARY_SHAPE} ${styles.primary}`}
        >
          {t(`intent.${first}.${itemType}`)}
        </Button>
        {rest.length > 0 && (
          <div className="contents">
            {rest.map((intent) => (
              <Button
                key={intent}
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => chooseIntent(intent)}
                className={`min-h-11 px-3 text-[13px] font-semibold ${PRIMARY_SHAPE} ${styles.secondary}`}
              >
                {t(`intent.${intent}.${itemType}`)}
              </Button>
            ))}
          </div>
        )}
        {errorLine}
      </div>
    );
  }

  const action = primaryAction(itemType, status);
  const episodeControls = action === "episode" ? episodes : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">{tPasses(`journalTitle.${itemType}`, { count: 1 })}</h2>
        <div data-testid="status-badge" aria-busy={busy}>
          <PassStatusSelect status={status} itemType={itemType} onChange={changeStatus} disabled={busy} />
        </div>
      </div>
      {episodeControls && (
        <>
          {episodeControls.primary}
          {episodeControls.feedback}
        </>
      )}
      {progress && (
        <div className="px-0.5">
          <div
            role="progressbar"
            aria-label={progress.left}
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 overflow-hidden rounded-full border border-border bg-surface-muted"
          >
            <div
              className={`h-full rounded-full bg-status-in-progress ${styles.fill}`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between gap-2 font-mono text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {progress.left}
              {/* Con el estado optimista: si se marca «Vista», la marca no se
                  queda colgada hasta que llegue el refresh. */}
              {upToDate && status === "in_progress" && (
                <span className="rounded-full bg-status-in-progress/15 px-1.5 py-px font-sans text-[10px] font-semibold text-status-in-progress">
                  {tEpisode("upToDate")}
                </span>
              )}
            </span>
            <span>{progress.right}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {!episodeControls && (
          <Button
            ref={primaryRef}
            type="button"
            disabled={busy}
            onClick={runPrimary}
            className={`min-h-11 self-start px-4 py-2 font-semibold ${PRIMARY_SHAPE} ${styles.primary}`}
          >
            {t(`action.${action}.${itemType}`)}
          </Button>
        )}

        {status !== "planned" && (
          <div
            data-testid="pass-card-rating"
            data-value={shownRating ?? ""}
            className="flex min-h-11 items-center gap-2 px-1"
          >
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {tRail("yourRating")}
            </span>
            <RatingDots
              value={shownRating}
              itemType={itemType}
              disabled={busy}
              lively
              onChange={(next) => {
                // Solo si de verdad arrancó la escritura: sin pase activo, sin
                // sesión o con otra escritura en vuelo, la nota parecería
                // guardada sin que nada llegue a BD.
                const ok = rate(next);
                if (ok) setShownRating(next);
                return ok;
              }}
            />
          </div>
        )}
      </div>

      {errorLine}
    </div>
  );
}
