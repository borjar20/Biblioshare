"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setReadingOrder } from "@/lib/sagas/route-actions";
import { sortCuratedRoutes, type CuratedRouteRow } from "@/lib/sagas/get-saga-routes";
import { Button } from "@/components/ui/button";

/** Designación del «Orden de lectura» de una saga (fase 4). Radios nativos
 *  —`<fieldset>` + `<input type="radio">` dentro de `<label>`— por el mismo
 *  criterio que `anchor-picker.tsx`/`tandem-picker.tsx`: un `radiogroup` a mano
 *  promete una semántica de teclado que no cumple.
 *
 *  «Ninguno» es una opción de verdad, no un botón de borrar: devolverle el
 *  puesto al mapa generado es una elección tan legítima como designar. */
export function ReadingOrderPicker({ sagaId, routes }: { sagaId: string; routes: CuratedRouteRow[] }) {
  const t = useTranslations("sagaEditor");
  const router = useRouter();
  const ordered = sortCuratedRoutes(routes);
  const current = ordered.find((r) => r.isReadingOrder)?.id ?? "";

  const [chosen, setChosen] = useState<string>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await setReadingOrder(sagaId, chosen === "" ? null : chosen);
      if (result.error) {
        setError(result.error);
        // La elección local vuelve a lo que hay en BD: si no, el radio se queda
        // marcado en algo que no se guardó.
        setChosen(current);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-border p-3">
      <h2 className="text-[13px] font-semibold">{t("readingOrderTitle")}</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{t("readingOrderHint")}</p>
      <fieldset className="mt-2 grid gap-1" disabled={pending}>
        <legend className="sr-only">{t("readingOrderTitle")}</legend>
        {[{ id: "", name: t("readingOrderNone") }, ...ordered].map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-[12.5px]">
            <input
              type="radio"
              name="reading-order"
              value={option.id}
              checked={chosen === option.id}
              onChange={() => setChosen(option.id)}
              className="h-4 w-4 border-border"
            />
            <span className="min-w-0 truncate">{option.name}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-2 flex items-center justify-end gap-2" aria-live="polite">
        {error && <p className="mr-auto text-xs text-status-dropped">{t(`routeErrors.${error}`)}</p>}
        <Button type="button" disabled={pending || chosen === current} onClick={submit}>
          {pending ? t("routeSaving") : t("readingOrderSave")}
        </Button>
      </div>
    </section>
  );
}
