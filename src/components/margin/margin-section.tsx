import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { getItemMarginNotes } from "@/lib/margin/queries";
import { MarginComposerButton } from "./margin-composer-button";
import { MarginNoteCard } from "./margin-note-card";
import { MarginReveal } from "./margin-reveal";
import { MarginRetroSeen } from "./margin-retro-seen";

export async function MarginSection({
  itemType,
  itemId,
  pages,
  marginPromise,
}: {
  itemType: ItemType;
  itemId: string;
  pages: number | null;
  marginPromise: ReturnType<typeof getItemMarginNotes>;
}) {
  const t = await getTranslations("margin");
  const { found, mine } = await marginPromise;
  const reveal = found.filter((n) => n.encounter && !n.encounter.seenAt && n.encounter.foundVia !== "retro");
  const retroUnseen = found.flatMap((n) =>
    n.encounter && !n.encounter.seenAt && n.encounter.foundVia === "retro" ? [n.encounter.id] : [],
  );
  return (
    <section className="flex flex-col gap-3" aria-labelledby="margin-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="margin-title" className="label-section">{t("sectionTitle")}</h3>
        <MarginComposerButton itemType={itemType} itemId={itemId} pages={pages} />
      </div>
      {found.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sectionEmpty")}</p>
      ) : (
        found.map((n) => (
          <MarginNoteCard
            key={n.noteId}
            note={n}
            showNew={!!n.encounter && !n.encounter.seenAt && n.encounter.foundVia === "retro"}
          />
        ))
      )}
      {mine.length > 0 && (
        <>
          <h4 className="text-sm font-medium">{t("mine")}</h4>
          {mine.map((n) => <MarginNoteCard key={n.noteId} note={n} />)}
        </>
      )}
      <MarginRetroSeen key={retroUnseen.join(",")} ids={retroUnseen} />
      {/* El key remonta (y reabre) la hoja cuando una revalidación trae encuentros nuevos. */}
      <MarginReveal key={reveal.map((n) => n.encounter!.id).join(",")} notes={reveal} />
    </section>
  );
}
