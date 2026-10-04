import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getMarginThread } from "@/lib/margin/queries";
import { getInteractionSummary } from "@/lib/social/get-interaction-summary";
import { itemHref } from "@/lib/catalog/item-href";
import { MarginNoteCard } from "@/components/margin/margin-note-card";
import { MarginThreadInteractions } from "@/components/margin/margin-thread-interactions";
import { MarginReportButton } from "@/components/margin/margin-report-button";
import { MarginRetroSeen } from "@/components/margin/margin-retro-seen";
import { RouteMessages } from "@/components/route-messages";
import { SHELL_READ } from "@/lib/ui/layout";
import { loginHref } from "@/lib/auth/safe-next";

// Hilo privado de una nota en el margen: solo autor y lector (RLS
// can_read_margin_encounter). Depende de quién mira → sin caché (#437).
export const metadata: Metadata = { title: "Nota en el margen — Biblioshare" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MarginThreadRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/margen/${id}`));
  const supabase = await createClient();
  const note = await getMarginThread(supabase, user.id, id);
  if (!note) notFound();
  const summary = (await getInteractionSummary(supabase, "margin_encounter", [id])).get(id);
  const t = await getTranslations("margin");
  const unseen = note.encounter && note.encounter.seenAt === null && user.id !== note.author.id;
  return (
    <RouteMessages ns={["margin", "social", "feed"]}>
      <div className={`mx-auto flex w-full ${SHELL_READ} flex-1 flex-col gap-4 px-5 pt-[18px] pb-[22px] lg:px-7 lg:pt-[26px]`}>
        <Link href={itemHref(note.itemType, note.itemId)} className="min-h-11 py-2 text-sm underline">
          {t("backToWork")}
        </Link>
        <MarginNoteCard note={{ ...note, encounter: null }} />
        {note.encounter && user.id !== note.author.id && <MarginReportButton encounterId={note.encounter.id} />}
        {summary && <MarginThreadInteractions summary={summary} viewerLoggedIn />}
        {unseen && note.encounter && <MarginRetroSeen ids={[note.encounter.id]} />}
      </div>
    </RouteMessages>
  );
}
