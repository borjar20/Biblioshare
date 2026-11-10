"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { intentsFor, primaryAction } from "@/lib/passes/pass-actions";
import { Button } from "@/components/ui/button";
import { RatingDots } from "@/components/ui/rating-dots";
import { useItemStatus } from "./item-status-context";
import { usePassActions } from "./pass-actions-provider";
import { StatusSegments } from "./status-segments";

export type PassCardProps = {
  itemType: ItemType;
  /** Solo donde hay cursor (libro, serie). La película no lleva barra. */
  progress: { percent: number; left: string; right: string } | null;
  /** Nota propia 1–10 del pase activo. */
  rating: number | null;
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
export function PassCard({ itemType, progress, rating }: PassCardProps) {
  const t = useTranslations("item");
  const tRail = useTranslations("detail.rail");
  const { status, isSaving } = useItemStatus();
  const { isPending, error, addWith, changeStatus, runPrimary, rate } = usePassActions();

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

  const shell =
    "flex flex-col gap-3 rounded-[14px] border border-border bg-surface/90 p-3.5 shadow-[0_18px_40px_-22px_rgba(60,35,15,0.55)] backdrop-blur-md";

  const errorLine = error && (
    <p role="alert" className="px-1 text-[13px] text-status-dropped">
      {t(error)}
    </p>
  );

  if (!status) {
    const [first, ...rest] = intentsFor(itemType);
    return (
      <div className={shell}>
        <Button
          type="button"
          disabled={isPending}
          onClick={() => addWith(first)}
          className="w-full py-3 font-semibold"
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
                disabled={isPending}
                onClick={() => addWith(intent)}
                className="w-full px-3 text-[13px] font-semibold"
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
      <div data-testid="status-badge" aria-busy={isSaving || isPending}>
        <StatusSegments
          status={status}
          itemType={itemType}
          onChange={changeStatus}
          disabled={isPending}
          compact
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
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{progress.left}</span>
            <span>{progress.right}</span>
          </div>
        </div>
      )}

      {/* Un <button>, no un enlace: a dónde se va (sesión, episodios) lo
          decide el proveedor, que antes cierra lo que hubiera abierto. */}
      <Button
        type="button"
        disabled={isPending}
        onClick={runPrimary}
        className="w-full rounded-[10px] py-3 font-semibold"
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
            disabled={isPending}
            onChange={(next) => {
              setShownRating(next);
              rate(next);
            }}
          />
        </div>
      )}

      {errorLine}
    </div>
  );
}
