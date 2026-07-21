"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { addNote, type AddNoteState } from "@/lib/notes/actions";
import { NoteComposer, type NoteAnchor } from "./note-composer";

const initialState: AddNoteState = {};

// El compositor en la ficha: aquí SÍ es dueño de un <form> propio, porque no
// hay ningún otro por encima (a diferencia de la hoja de sesión). Sustituye a
// AddNoteForm, que duplicaba estos campos con menos.
export function NoteForm({
  itemType,
  itemId,
  anchor,
}: {
  itemType: ItemType;
  itemId: string;
  anchor: NoteAnchor;
}) {
  const t = useTranslations("notes");
  const boundAdd = addNote.bind(null, itemType, itemId);
  const [state, formAction, pending] = useActionState(boundAdd, initialState);
  const [hasBody, setHasBody] = useState(false);
  // useActionState devuelve la MISMA referencia de estado hasta que la acción
  // resuelve; al resolver sin error, remontamos el compositor (vía `key`) para
  // que vuelva a su estado inicial: plegado y vacío. Mismo patrón que
  // session-sheet.tsx y close-pass-sheet.tsx.
  const [prevState, setPrevState] = useState(state);
  const [resetCount, setResetCount] = useState(0);
  if (state !== prevState) {
    setPrevState(state);
    if (state !== initialState && !state.error) {
      setResetCount((n) => n + 1);
      setHasBody(false);
    }
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
    >
      <NoteComposer
        key={resetCount}
        anchor={anchor}
        anchorHint={anchor.kind === "page" ? t("anchorFromPass") : undefined}
        onHasBodyChange={setHasBody}
      />

      {state.error && (
        <p className="text-sm text-status-dropped">
          {state.error === "empty" ? t("errorEmpty") : t("errorGeneric")}
        </p>
      )}

      {hasBody && (
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? t("saving") : t("save")}
        </Button>
      )}
    </form>
  );
}
