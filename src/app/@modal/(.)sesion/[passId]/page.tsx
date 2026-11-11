import { loadSessionContext, parseMinutes } from "@/lib/sessions/load-context";
import { parseStartedAt } from "@/lib/sessions/parse-started-at";
import { itemHref } from "@/lib/catalog/item-href";
import { SessionModal } from "@/components/session/session-modal";
import { SessionSheet } from "@/components/session/session-sheet";
import { RouteMessages } from "@/components/route-messages";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function SessionModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ passId: string }>;
  searchParams: Promise<{ minutos?: string; inicio?: string }>;
}) {
  const { passId } = await params;
  const { minutos, inicio } = await searchParams;

  const ctx = await loadSessionContext(passId);

  // `?tab=log`: se vuelve a "Mi registro" porque es donde se ve lo que se acaba
  // de guardar (la sección Sesiones y el historial de pases). Ya no es de donde
  // se entra: el botón principal de la tarjeta del hero vive por encima de las
  // pestañas (spec 2026-11-10-ficha-acciones). ItemDetailTabs solo monta la
  // pestaña activa, así que sin esto la ficha abriría en "Información".
  return (
    <RouteMessages ns={["episode", "library", "margin", "notes", "passes", "ritual", "session"]}>
      <SessionModal exitHref={`${itemHref(ctx.itemType, ctx.itemId)}?tab=log`}>
        <SessionSheet
          ctx={ctx}
          initialMinutes={parseMinutes(minutos)}
          initialStartedAt={parseStartedAt(inicio)}
          mode="modal"
        />
      </SessionModal>
    </RouteMessages>
  );
}
