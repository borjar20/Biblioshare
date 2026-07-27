"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { generateRoute } from "@/lib/sagas/route-actions";

type GenerateState = { error?: string };
const initialState: GenerateState = {};

// Botón «Generar desde la curación» (Task 6, fase 3): construye un
// itinerario NUEVO recorriendo lo que ya está curado, en vez de obligar a
// empezar en blanco — la razón por la que hoy apenas hay itinerarios en
// producción. Mismo patrón que CreateRouteForm (useActionState para leer el
// error que devuelve el server action) y que el `move` de RouteRow
// (router.refresh() tras una acción sin campos): generateRoute solo necesita
// `sagaId`, así que aquí no hace falta montar ningún `useState` propio, solo
// envolverlo para que encaje en la firma (prevState, formData) que pide
// useActionState.
export function GenerateRouteButton({ sagaId }: { sagaId: string }) {
  const t = useTranslations("sagaEditor");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async (_prev: GenerateState, _formData: FormData) => {
    const result = await generateRoute(sagaId);
    // Éxito: refresca para que el nuevo itinerario aparezca en la lista de
    // arriba, igual que hace RouteRow tras mover/borrar.
    if (!result.error) router.refresh();
    return result;
  }, initialState);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="block w-full rounded-lg border border-border py-1.5 text-center text-[11.5px] font-semibold disabled:opacity-60"
      >
        {pending ? t("routeCreating") : t("itineraryGenerate")}
      </button>
      {state.error && (
        <p className="mt-1.5 text-[11px] text-status-dropped">
          {/* Hallazgo 2 (revisión Task 6): "slugTaken" tenía su propia copia
              en generateRoute pero caía en el genericError de aquí, así que
              el curador no podía distinguir "esto se ha roto" de "esto ya lo
              generaste" — el caso natural tras curar más y volver a pulsar. */}
          {state.error === "empty"
            ? t("itineraryGenerateEmpty")
            : state.error === "slugTaken"
              ? t("itineraryGenerateSlugTaken")
              : t("genericError")}
        </p>
      )}
    </form>
  );
}
