"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Note } from "@/lib/notes/types";
import { addNote, deleteNote } from "@/lib/notes/actions";
import { normalizeTags } from "@/lib/notes/tags";
import { NoteCard } from "@/components/notes/note-card";
import { NoteComposer, type NoteAnchor, type NoteDraft } from "@/components/notes/note-composer";

function SavedNoteRow({
  note,
  onDeleted,
}: {
  note: Note;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("notes");
  const [pending, startTransition] = useTransition();
  return (
    <div className="relative">
      <NoteCard note={note} showDelete={false} />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deleteNote(note.id, note.itemType, note.itemId);
            onDeleted(note.id);
          })
        }
        className="absolute top-3 right-3 text-[11px] text-status-dropped underline disabled:opacity-50"
      >
        {t("delete")}
      </button>
      <input type="hidden" name="noteIds" value={note.id} />
    </div>
  );
}

// El cuaderno de la hoja de sesión: varias notas/citas, cada una persistida
// al momento (addNote, session_id null todavía) — no al enviar el <form> de
// la sesión. Sustituye al NoteComposer suelto que antes vivía aquí (una sola
// nota, en memoria hasta el envío final). Ver spec 2026-07-29, D1-D4.
//
// `noteIds` (hidden inputs, uno por SavedNoteRow) es cómo la sesión, al
// guardarse, sabe qué notas enlazar (addSession hace el UPDATE session_id)
// — la propia lista `notes` de aquí abajo es la fuente de esos ids, no hace
// falta estado aparte.
export function SessionNotebook({
  itemType,
  itemId,
  anchor,
  anchorHint,
  onPendingChange,
  onCountChange,
}: {
  itemType: ItemType;
  itemId: string;
  anchor: NoteAnchor;
  anchorHint?: string;
  /** Reenvía onHasBodyChange de NoteComposer: hay texto sin guardar en el
   *  compositor ahora mismo. session-sheet.tsx lo usa para bloquear "Guardar
   *  sesión" y no perder ese texto en silencio. */
  onPendingChange?: (hasPending: boolean) => void;
  /** Cuántas notas lleva guardadas — session-sheet.tsx lo usa para la
   *  etiqueta del botón "Guardar sesión". */
  onCountChange?: (count: number) => void;
}) {
  const t = useTranslations("notes");
  const [notes, setNotes] = useState<Note[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    onCountChange?.(notes.length);
  }, [notes.length, onCountChange]);

  async function handleSave(draft: NoteDraft): Promise<boolean> {
    setSaveError(null);
    const formData = new FormData();
    formData.set("note", draft.body);
    formData.set("noteKind", draft.kind);
    if (draft.favorite) formData.set("noteFavorite", "on");
    if (draft.spoiler) formData.set("noteSpoiler", "on");
    if (draft.public) formData.set("notePublic", "on");
    formData.set("noteTags", draft.tags);
    if (itemType === "book") formData.set("notePage", draft.page);
    if (itemType === "series" && draft.season !== null && draft.episode !== null) {
      formData.set("noteSeason", String(draft.season));
      formData.set("noteEpisode", String(draft.episode));
    }

    const result = await addNote(itemType, itemId, {}, formData);
    if (result.error || !result.id) {
      setSaveError(result.error === "empty" ? t("errorEmpty") : t("errorGeneric"));
      return false;
    }

    const position =
      itemType === "book" && draft.page
        ? { page: Number(draft.page) }
        : itemType === "series" && draft.season !== null && draft.episode !== null
          ? { season: draft.season, episode: draft.episode }
          : {};

    setNotes((prev) => [
      ...prev,
      {
        id: result.id!,
        itemType,
        itemId,
        kind: draft.kind,
        body: draft.body,
        position,
        isFavorite: draft.favorite,
        tags: normalizeTags(draft.tags),
        isSpoiler: draft.spoiler,
        isPublic: draft.public,
        createdAt: new Date().toISOString(),
        itemTitle: null,
      },
    ]);
    return true;
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((note) => (
        <SavedNoteRow
          key={note.id}
          note={note}
          onDeleted={(id) => setNotes((prev) => prev.filter((n) => n.id !== id))}
        />
      ))}

      <NoteComposer
        anchor={anchor}
        anchorHint={anchorHint}
        defaultOpen={notes.length > 0}
        onHasBodyChange={onPendingChange}
        onSave={handleSave}
        saveError={saveError}
      />
    </div>
  );
}
