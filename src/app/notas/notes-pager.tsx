import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NOTES_PAGE_SIZE, notesHref, type NotesQuery } from "@/lib/notes/query";

// Anterior / siguiente sobre el `count` exacto que devuelve getNotesPage. Es el
// único sitio que pasa `page` explícita a notesHref — cualquier otro cambio de
// filtro devuelve a la página 1 a propósito.
// Sin total conocido (listas del margen) se pasa `hasMore` y no se pinta «de N».
export async function NotesPager({
  query,
  total,
  hasMore,
}: { query: NotesQuery; total?: number; hasMore?: boolean }) {
  const t = await getTranslations("notes");
  const unknownTotal = total === undefined;
  const pages = unknownTotal
    ? query.page + (hasMore ? 1 : 0)
    : Math.max(1, Math.ceil(total / NOTES_PAGE_SIZE));
  if (pages <= 1) return null;

  const current = unknownTotal ? query.page : Math.min(query.page, pages);

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
        {unknownTotal ? current : t("notebookPageOf", { current, total: pages })}
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
