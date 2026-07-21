import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NOTES_PAGE_SIZE, notesHref, type NotesQuery } from "@/lib/notes/query";

// Anterior / siguiente sobre el `count` exacto que devuelve getNotesPage. Es el
// único sitio que pasa `page` explícita a notesHref — cualquier otro cambio de
// filtro devuelve a la página 1 a propósito.
export async function NotesPager({ query, total }: { query: NotesQuery; total: number }) {
  const t = await getTranslations("notes");
  const pages = Math.max(1, Math.ceil(total / NOTES_PAGE_SIZE));
  if (pages <= 1) return null;

  const current = Math.min(query.page, pages);

  return (
    <nav className="flex items-center justify-between gap-3 pt-2">
      {current > 1 ? (
        <Link
          href={notesHref(query, { page: current - 1 })}
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("notebookPrev")}
        </Link>
      ) : (
        <span />
      )}

      <span className="font-mono text-[11px] text-muted-foreground">
        {t("notebookPageOf", { current, total: pages })}
      </span>

      {current < pages ? (
        <Link
          href={notesHref(query, { page: current + 1 })}
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("notebookNext")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
