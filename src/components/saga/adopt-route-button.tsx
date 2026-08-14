"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { adoptRoute, dropRoute, type RouteFormState } from "@/lib/sagas/route-actions";

const initialState: RouteFormState = {};

// #174: Client Component con useActionState — mismo patrón que RouteForm
// (routes/route-form.tsx) y NewSagaForm. Antes era un Server Component con
// dos <form action={...}>: cero JS, pero también cero forma de leer si el
// upsert/delete de adoptRoute/dropRoute había fallado en servidor — el <form>
// se desmontaba igual y la pantalla mentía sobre el estado real. Sacrifica la
// progresividad sin JS (ya asumida por el resto de acciones de saga que usan
// este mismo patrón) a cambio de poder leer el error tipado.
export function AdoptRouteButton({
  sagaId,
  slug,
  adopted,
  labels,
}: {
  sagaId: string;
  slug: string;
  adopted: boolean;
  labels: { adopt: string; adopted: string };
}) {
  const t = useTranslations("saga");
  const [state, formAction, pending] = useActionState(
    async () => (adopted ? dropRoute(sagaId) : adoptRoute(sagaId, slug)),
    initialState,
  );

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-60 ${
          adopted ? "bg-surface-muted text-muted-foreground" : "bg-foreground text-background"
        }`}
      >
        {adopted ? labels.adopted : labels.adopt}
      </button>
      {state.error && (
        <p role="alert" className="mt-1 text-[11px] text-status-dropped">
          {t("routeAdoptError")}
        </p>
      )}
    </form>
  );
}
