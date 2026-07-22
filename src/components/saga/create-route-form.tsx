"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createRoute, type RouteFormState } from "@/lib/sagas/route-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: RouteFormState = {};

// Alta de itinerario (Task 8). Mismo patrón que NewSagaForm/SagaMetaEditor:
// useActionState + bind de los argumentos fijos (sagaId), para que el error
// devuelto por el server action llegue a la UI. La versión del brief
// (`await import(...)` + `.bind(null, sagaId, {})` dentro de un componente
// servidor) descarta el estado devuelto — el form nunca mostraría
// "nombre obligatorio" ni "ya existe" — así que se cambia por este patrón,
// coherente con el resto del dominio de sagas.
export function CreateRouteForm({ sagaId }: { sagaId: string }) {
  const t = useTranslations("sagaEditor");
  const [state, formAction, pending] = useActionState(createRoute.bind(null, sagaId), initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="route-name">
        {t("routeNameLabel")}
      </label>
      <Input id="route-name" name="name" required maxLength={80} />
      <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="route-summary">
        {t("routeSummaryLabel")}
      </label>
      <Input id="route-summary" name="summary" maxLength={280} />
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? t("routeCreating") : t("routeCreate")}
      </Button>
      {state.error && <p className="text-xs text-status-dropped">{t(`routeErrors.${state.error}`)}</p>}
    </form>
  );
}
