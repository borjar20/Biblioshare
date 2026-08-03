import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { itemHref } from "@/lib/catalog/item-href";
import type { Note } from "@/lib/notes/types";
import { getNotesPage } from "@/lib/notes/get-notes";
import { compareNotes } from "@/lib/notes/sort";
import { hasActiveFilters, parseNotesQuery } from "@/lib/notes/query";
import { NoteCard } from "@/components/notes/note-card";
import { NOTE_GRID_COLS, SHELL_GRID } from "@/lib/ui/layout";
import { NotesFilters } from "./notes-filters";
import { NotesPager } from "./notes-pager";

export const metadata: Metadata = {
  title: "Cuaderno — Biblioshare",
};

// Agrupa una página YA ordenada por (item_type, item_id) en tramos por obra,
// conservando el orden en que llegaron: eso es lo que mantiene estable la
// paginación. Dentro de cada obra manda compareNotes — orden de lectura, la
// misma regla que la ficha, sin una segunda copia.
function groupByItem(notes: Note[]): { key: string; notes: Note[] }[] {
  const groups: { key: string; notes: Note[] }[] = [];
  for (const note of notes) {
    const key = `${note.itemType}:${note.itemId}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.notes.push(note);
    else groups.push({ key, notes: [note] });
  }
  for (const group of groups) {
    group.notes.sort((a, b) => compareNotes(a.itemType, a, b));
  }
  return groups;
}

// El cuaderno (Plan B, D7): ruta propia en vez de reconvertir la pestaña Rincón,
// que ya aloja retos, sorteo y contadores. Privada del dueño — RLS le daría cero
// filas a un visitante, pero la ruta además exige sesión y no se ofrece en
// perfiles ajenos.
//
// Todo el estado (filtros, búsqueda, orden, página) vive en la URL y todo el
// trabajo se hace en el servidor: los filtros y la paginación son SQL, no un
// array entero viajando al cliente.
export default async function NotebookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/notas"));

  const t = await getTranslations("notes");
  const query = parseNotesQuery(await searchParams);

  const [profile, { notes, total }] = await Promise.all([
    getOwnProfile(supabase, user.id),
    getNotesPage(supabase, user.id, query),
  ]);

  const backHref = profile ? `/u/${profile.username}?tab=rincon` : "/";
  const filtered = hasActiveFilters(query);

  return (
    <main className={`mx-auto w-full ${SHELL_GRID} px-4 py-4 pb-24 sm:px-6 lg:px-8`}>
      <header className="mb-4 flex items-center gap-3">
        <Link
          href={backHref}
          aria-label={t("notebookBack")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-lg text-muted-foreground transition-colors hover:text-foreground"
        >
          ‹
        </Link>
        <h1 className="font-serif text-xl font-semibold tracking-tight text-foreground">
          {t("notebookTitle")}
        </h1>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {t("notebookResults", { count: total })}
        </span>
      </header>

      <div className="mb-4">
        <NotesFilters query={query} />
      </div>

      {notes.length === 0 ? (
        // Dos vacíos distintos con dos salidas distintas: «no tienes nada» te
        // dice dónde anotar; «no hay nada con estos filtros» te dice que los
        // quites (el enlace ya está en la barra).
        <p className="text-sm text-muted-foreground">
          {filtered ? t("notebookEmptyFiltered") : t("notebookEmpty")}
        </p>
      ) : query.sort === "obra" ? (
        // Agrupado por obra: la rejilla va DENTRO de cada grupo y el título de
        // la obra se queda como banda a todo lo ancho. Una sola rejilla para
        // todo se comería la agrupación, que es justo lo que pide este orden.
        <div className="flex flex-col gap-6">
          {groupByItem(notes).map((group) => {
            const first = group.notes[0];
            return (
              <section key={group.key} className="flex flex-col gap-3">
                <Link
                  href={itemHref(first.itemType, first.itemId)}
                  className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase hover:text-accent"
                >
                  {first.itemTitle ?? t("notebookUnknownWork")}
                </Link>
                <div className={`grid items-start gap-3 ${NOTE_GRID_COLS}`}>
                  {group.notes.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        // `items-start`: cada nota mide lo que mide y los bajos quedan
        // desiguales. Es a propósito — la alternativa es recortar el cuerpo, y
        // una nota cortada no tiene dónde seguir leyéndose (no hay ficha de
        // nota). Tampoco vale `columns-*` estilo masonry: reordena la lectura
        // en vertical por columna y se cargaría el orden «recientes».
        <div className={`grid items-start gap-3 ${NOTE_GRID_COLS}`}>
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} showItem />
          ))}
        </div>
      )}

      <NotesPager query={query} total={total} />
    </main>
  );
}
