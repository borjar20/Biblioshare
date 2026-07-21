import { loadSessionContext, parseMinutes } from "@/lib/sessions/load-context";
import { itemHref } from "@/lib/catalog/item-href";
import { SessionModal } from "@/components/session/session-modal";
import { SessionSheet } from "@/components/session/session-sheet";

export default async function SessionModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ passId: string }>;
  searchParams: Promise<{ minutos?: string }>;
}) {
  const { passId } = await params;
  const { minutos } = await searchParams;

  const ctx = await loadSessionContext(passId);

  // `?tab=log`: se vuelve a "Mi registro", que es de donde se entra a registrar
  // una sesión y donde se ve lo que se acaba de guardar. ItemDetailTabs solo
  // monta la pestaña activa, así que sin esto la ficha abriría en
  // "Información" — con back() esto salía gratis porque la URL anterior ya lo
  // llevaba.
  return (
    <SessionModal exitHref={`${itemHref(ctx.itemType, ctx.itemId)}?tab=log`}>
      <SessionSheet ctx={ctx} initialMinutes={parseMinutes(minutos)} mode="modal" />
    </SessionModal>
  );
}
