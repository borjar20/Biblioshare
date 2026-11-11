"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { intentsFor, primaryAction, type Intent } from "@/lib/passes/pass-actions";
import { Button } from "@/components/ui/button";
import { RatingDots } from "@/components/ui/rating-dots";
import { useItemStatus } from "./item-status-context";
import { usePassActions } from "./pass-actions-provider";
import { StatusSegments } from "./status-segments";

// La misma forma para el botón principal con y sin pase (y para las
// intenciones secundarias): la tarjeta cambia de contenido, no de lenguaje.
// Es el radio del control de estado (StatusSegments, rounded-[10px]).
const PRIMARY_SHAPE = "rounded-[10px]";

export type PassCardProps = {
  itemType: ItemType;
  /** Solo donde hay cursor (libro, serie). La película no lleva barra. */
  progress: { percent: number; left: string; right: string } | null;
  /** Nota propia 1–10 del pase activo. */
  rating: number | null;
  /** Solo series: «Al día» (isUpToDate, src/lib/series/follow-state.ts), que
   *  calcula la ficha con los datos del pase. Es un estado DERIVADO, no una
   *  pastilla más: se marca junto al progreso y StatusSegments sigue en «Viendo». */
  upToDate?: boolean;
};

// «Tu pase» en la cabecera de la ficha, y el MANDO de la obra (spec
// 2026-11-10-ficha-acciones): sin pase ofrece las intenciones («Quiero leerlo»,
// «Lo estoy leyendo», «Ya lo leí»); con pase, el estado se cambia aquí mismo, la
// acción principal depende del estado y la nota se pone sin ir a Mi registro.
// Todo lo que escribe pasa por usePassActions: la tarjeta no sabe de server
// actions, de login ni de hojas.
//
// El botón principal es SIEMPRE el naranja del rol (`bg-accent`, F3-006), no el
// color del tipo de medio: el color de tipo es del CONTENIDO, el del CTA es de
// la acción.
export function PassCard({ itemType, progress, rating, upToDate = false }: PassCardProps) {
  const t = useTranslations("item");
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

  const shell =
    "flex flex-col gap-3 rounded-[14px] border border-border bg-surface/90 p-3.5 shadow-[0_18px_40px_-22px_rgba(60,35,15,0.55)] backdrop-blur-md";

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
      <div className={shell}>
        <Button
          type="button"
          disabled={busy}
          onClick={() => chooseIntent(first)}
          className={`w-full py-3 font-semibold ${PRIMARY_SHAPE}`}
        >
          {t(`intent.${first}.${itemType}`)}
        </Button>
        {rest.length > 0 && (
          <div className={`grid gap-2 ${rest.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {rest.map((intent) => (
              <Button
                key={intent}
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => chooseIntent(intent)}
                className={`w-full px-3 text-[13px] font-semibold ${PRIMARY_SHAPE}`}
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

  return (
    <div className={shell}>
      {/* data-testid: los e2e esperan a que aria-busy vuelva a false (#106). */}
      <div data-testid="status-badge" aria-busy={busy}>
        <StatusSegments
          status={status}
          itemType={itemType}
          onChange={changeStatus}
          disabled={busy}
        />
      </div>

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
              className="h-full rounded-full bg-status-in-progress"
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

      {/* Un <button>, no un enlace: a dónde se va (sesión, episodios) lo
          decide el proveedor, que antes cierra lo que hubiera abierto. */}
      <Button
        ref={primaryRef}
        type="button"
        disabled={busy}
        onClick={runPrimary}
        className={`w-full py-3 font-semibold ${PRIMARY_SHAPE}`}
      >
        {t(`action.${action}.${itemType}`)}
      </Button>

      {status !== "planned" && (
        <div
          data-testid="pass-card-rating"
          data-value={shownRating ?? ""}
          className="flex items-center justify-between gap-2.5 px-1"
        >
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {tRail("yourRating")}
          </span>
          <RatingDots
            value={shownRating}
            itemType={itemType}
            disabled={busy}
            onChange={(next) => {
              // Solo si de verdad arrancó la escritura: sin pase activo, sin
              // sesión o con otra escritura en vuelo, la nota parecería
              // guardada sin que nada llegue a BD.
              if (rate(next)) setShownRating(next);
            }}
          />
        </div>
      )}

      {errorLine}
    </div>
  );
}
