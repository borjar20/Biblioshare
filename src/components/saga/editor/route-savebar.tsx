"use client";

import { useTranslations } from "next-intl";
import type { RouteDiff } from "@/lib/sagas/compute-route-diff";

/** Barra de guardado: recuento de cambios por categoría + el error de
 *  validación integrado (mockup M7) — sustituye el `<p>` rojo suelto del
 *  editor anterior. Con `diff.total === 0` el botón se deshabilita: no hay
 *  nada que enviar. */
export function RouteSavebar({
  diff,
  error,
  pending,
  onSave,
}: {
  diff: RouteDiff;
  error: string | null;
  pending: boolean;
  onSave: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const parts = [
    diff.added > 0 && t("routeDiffAdded", { count: diff.added }),
    diff.removed > 0 && t("routeDiffRemoved", { count: diff.removed }),
    diff.moved > 0 && t("routeDiffMoved", { count: diff.moved }),
    diff.noted > 0 && t("routeDiffNoted", { count: diff.noted }),
  ].filter((p): p is string => Boolean(p));

  const canSave = diff.total > 0 && !pending;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
      {error && (
        <p role="alert" className="text-[11.5px] text-status-dropped">
          {t(`routeErrors.${error}`)}
        </p>
      )}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <b className="block text-[12.5px] font-semibold">
            {diff.total === 0 ? t("routeDiffNone") : t("routeDiffTotal", { count: diff.total })}
          </b>
          {parts.length > 0 && (
            <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {parts.join(" · ")}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="shrink-0 rounded-lg bg-foreground px-3 py-1.5 text-[11.5px] font-semibold text-background disabled:opacity-50"
        >
          {pending ? t("routeStepsSaving") : t("routeStepsSave")}
        </button>
      </div>
    </div>
  );
}
