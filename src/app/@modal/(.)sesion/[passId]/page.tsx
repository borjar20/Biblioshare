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

  // `?tab=log`: se vuelve a "Mi registro", que es de donde se entra a registrar
  // una sesión y donde se ve lo que se acaba de guardar. ItemDetailTabs solo
  // monta la pestaña activa, así que sin esto la ficha abriría en
  // "Información" — con back() esto salía gratis porque la URL anterior ya lo
  // llevaba.
  return (
    <RouteMessages ns={["episode", "library", "notes", "passes", "session"]}>
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
