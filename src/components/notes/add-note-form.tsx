"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { NoteIcon } from "@/components/ui/icons";
import { addNote, type AddNoteState } from "@/lib/notes/actions";

const initialState: AddNoteState = {};

// Añadir una nota o cita a Memorizar desde la ficha (sin sesión): sirve también
// para películas, que no tienen sesión (plan 05, P7). Plegado por defecto.
export function AddNoteForm({
  itemType,
  itemId,
  showPage = false,
}: {
  itemType: ItemType;
  itemId: string;
  /** El campo de página solo tiene sentido para libros. */
  showPage?: boolean;
}) {
  const t = useTranslations("notes");
  const [open, setOpen] = useState(false);
  const boundAdd = addNote.bind(null, itemType, itemId);
  const [state, formAction, pending] = useActionState(boundAdd, initialState);
  // useActionState devuelve la MISMA referencia hasta que la acción resuelve;
  // al resolver sin error, se cierra el formulario.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state !== initialState && !state.error) setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 self-start rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
      >
        <NoteIcon className="h-4 w-4" />
        {t("add")}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4"
    >
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("addTitle")}
      </h3>

      <div className="flex gap-1 self-start rounded-[9px] bg-surface-muted p-1">
        {(["note", "quote"] as const).map((k) => (
          <label
            key={k}
            className="cursor-pointer rounded-[6px] px-3 py-1.5 text-[12px] font-semibold text-muted-foreground has-[:checked]:bg-surface has-[:checked]:text-foreground has-[:checked]:shadow-card"
          >
            <input
              type="radio"
              name="kind"
              value={k}
              defaultChecked={k === "note"}
              className="sr-only"
            />
            {k === "note" ? t("kindNote") : t("kindQuote")}
          </label>
        ))}
      </div>

      <Field label={t("bodyLabel")} htmlFor="note-body">
        <textarea
          id="note-body"
          name="body"
          rows={3}
          placeholder={t("bodyPlaceholder")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </Field>

      {showPage && (
        <Field label={t("pageLabel")} htmlFor="note-page">
          <Input id="note-page" name="page" type="number" min={0} inputMode="numeric" />
        </Field>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="isFavorite"
          className="h-4 w-4 rounded border-border accent-accent"
        />
        {t("favorite")}
      </label>

      {state.error && (
        <p className="text-sm text-status-dropped">
          {state.error === "empty" ? t("errorEmpty") : t("errorGeneric")}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
