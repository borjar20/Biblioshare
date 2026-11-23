import { getTranslations } from "next-intl/server";
import type { getItemMarginNotes } from "@/lib/margin/queries";
import { MarginNoteCard } from "./margin-note-card";
import { MarginReveal } from "./margin-reveal";
import { MarginRetroSeen } from "./margin-retro-seen";

export async function MarginSection({
  marginPromise,
}: {
  marginPromise: ReturnType<typeof getItemMarginNotes>;
}) {
  const t = await getTranslations("margin");
  const { found, mine } = await marginPromise;
  if (!found.length && !mine.length) return null;
  const reveal = found.filter((n) => n.encounter && !n.encounter.seenAt && n.encounter.foundVia !== "retro");
  const retroUnseen = found.flatMap((n) =>
    n.encounter && !n.encounter.seenAt && n.encounter.foundVia === "retro" ? [n.encounter.id] : [],
  );
  return (
    <section className="flex flex-col gap-3" aria-labelledby="margin-title">
      <h3 id="margin-title" data-section-title className="label-section">{t("sectionTitle")}</h3>
      {found.map((n) => (
        <MarginNoteCard
          key={n.noteId}
          note={n}
          showNew={!!n.encounter && !n.encounter.seenAt && n.encounter.foundVia === "retro"}
        />
      ))}
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
