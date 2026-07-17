import { getTranslations } from "next-intl/server";
import type { NoteCounts } from "@/lib/notes/types";

// "Notas guardadas" del rail del Rincón (frame H): citas / notas / favoritas.
export async function NotesCountsCard({ counts }: { counts: NoteCounts }) {
  const t = await getTranslations("notes");

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("savedTitle")}
      </h3>
      <div className="flex flex-col">
        <Row k={t("savedQuotes")} v={counts.quotes} />
        <Row k={t("savedNotes")} v={counts.notes} />
        <Row k={t("savedFavorites")} v={counts.favorites} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm font-medium text-foreground">{v}</span>
    </div>
  );
}
