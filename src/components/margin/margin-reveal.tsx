"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { markSeenInChunks } from "./mark-seen";
import type { MarginNoteView } from "@/lib/margin/types";
import { MarginNoteCard } from "./margin-note-card";

// Aparece cuando la ficha se vuelve a renderizar tras guardar progreso y hay
// encuentros por progreso/cierre sin ver. Los retroactivos NO pasan por aquí.
// Mismo primitivo que MarginNoteSheet: <dialog> nativo + showModal(). Cerrarla
// de cualquier forma (botón, Escape, clic fuera) las marca como vistas. Quien la
// monta le da un `key` con los ids de los encuentros: si una revalidación trae
// otros nuevos se remonta y se reabre; con los mismos ids no se reabre sola.
export function MarginReveal({ notes }: { notes: MarginNoteView[] }) {
  const t = useTranslations("margin");
  const [open, setOpen] = useState(notes.length > 0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, [open]);

  if (!open || notes.length === 0) return null;
  const title = t("revealTitle", { count: notes.length });

  const dismiss = () => {
    setOpen(false);
    void markSeenInChunks(notes.flatMap((n) => (n.encounter ? [n.encounter.id] : [])));
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClose={dismiss}
      className="m-auto w-[min(420px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
      onClick={(event) => {
        if (event.target === dialogRef.current) dismiss();
      }}
    >
      <div className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-4">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        {notes.map((n) => (
          <MarginNoteCard key={n.noteId} note={n} />
        ))}
        <button
          type="button"
          className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground"
          onClick={dismiss}
        >
          {t("revealClose")}
        </button>
      </div>
    </dialog>
  );
}
