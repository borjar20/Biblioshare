"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createRoute, renameRoute, type RouteFormState } from "@/lib/sagas/route-actions";

// Los mismos topes que aceptan las acciones de servidor. Se repiten aquí para
// que el curador vea el contador llenarse en vez de descubrir el corte al
// guardar.
const NAME_MAX = 80;
const SUMMARY_MAX = 280;

const initialState: RouteFormState = {};

/** Alta y renombrado de un itinerario: los mismos dos campos, distinta acción.
 *  `route === null` es crear.
 *
 *  El error del servidor se pinta EN EL CAMPO que lo causa (`nameRequired` y
 *  `slugTaken` son los dos del nombre) en vez del párrafo rojo suelto al pie
 *  que tenía la pantalla anterior: con dos campos, un mensaje al pie obliga a
 *  adivinar cuál de los dos hay que tocar.
 *
 *  `idPrefix` existe porque este formulario se monta hasta tres veces a la vez
 *  —el raíl de escritorio, la hoja de móvil y el hueco de lista vacía— y dos
 *  `<label for>` con el mismo id apuntarían al campo equivocado. */
export function RouteForm({
  sagaId,
  route,
  idPrefix,
  onDone,
  onCancel,
}: {
  sagaId: string;
  route: { id: string; name: string; summary: string | null } | null;
  idPrefix: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const [name, setName] = useState(route?.name ?? "");
  const [summary, setSummary] = useState(route?.summary ?? "");

  // Se envuelve la acción para cerrar en cuanto el submit termina sin error,
  // sin depender de un efecto que compare estado anterior y nuevo — mismo
  // patrón que usaba el renombrado de `route-list.tsx`.
  const [state, formAction, pending] = useActionState(
    async (prev: RouteFormState, formData: FormData) => {
      const result = route
        ? await renameRoute(route.id, sagaId, prev, formData)
        : await createRoute(sagaId, prev, formData);
      if (!result.error) {
        if (!route) {
          setName("");
          setSummary("");
        }
        onDone();
      }
      return result;
    },
    initialState,
  );

  const nameError = state.error === "nameRequired" || state.error === "slugTaken" ? state.error : null;
  const otherError = state.error && !nameError ? state.error : null;

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-1.5">
        <label
          htmlFor={`${idPrefix}-name`}
          className="flex font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          {t("routeNameLabel")}
          <b className="ml-auto font-normal tracking-[0.06em] text-foreground-faint">
            {name.length}/{NAME_MAX}
          </b>
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("routeNamePlaceholder")}
          aria-invalid={nameError !== null}
          aria-describedby={nameError ? `${idPrefix}-name-error` : undefined}
          className={`rounded-lg border bg-surface-muted px-2.5 py-2 text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-1 focus:ring-accent ${
            nameError ? "border-status-dropped" : "border-border"
          }`}
        />
        {nameError && (
          <p id={`${idPrefix}-name-error`} className="text-[11.5px] leading-snug text-status-dropped">
            {t(`routeErrors.${nameError}`)}
          </p>
        )}
        {route && <p className="text-[11px] leading-snug text-muted-foreground">{t("routeSlugUnchanged")}</p>}
      </div>

      <div className="grid gap-1.5">
        <label
          htmlFor={`${idPrefix}-summary`}
          className="flex font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          {t("routeSummaryLabel")}
          <b className="ml-auto font-normal tracking-[0.06em] text-foreground-faint">
            {t("routeSummaryOptional")} · {summary.length}/{SUMMARY_MAX}
          </b>
        </label>
        <textarea
          id={`${idPrefix}-summary`}
          name="summary"
          rows={2}
          maxLength={SUMMARY_MAX}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t("routeSummaryPlaceholder")}
          className="resize-none rounded-lg border border-border bg-surface-muted px-2.5 py-2 text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {otherError && <p className="text-[11.5px] text-status-dropped">{t(`routeErrors.${otherError}`)}</p>}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground disabled:opacity-40"
          >
            {t("routeCancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-accent-foreground disabled:opacity-50"
        >
          {route ? (pending ? t("routeSaving") : t("routeSave")) : pending ? t("routeCreating") : t("routeCreate")}
        </button>
      </div>
    </form>
  );
}
