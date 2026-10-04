"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteMarginNote } from "@/lib/margin/actions";

// Borrar una nota propia, con confirmación que dice cuántas conversaciones se
// pierden (cada encuentro con hilo es una). La acción revalida la ficha.
export function MarginOwnActions({ noteId, conversations }: { noteId: string; conversations: number }) {
  const t = useTranslations("margin");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 self-start py-2 text-sm text-muted-foreground underline"
      >
        {t("delete")}
      </button>
    );
  }
  return (
    <div role="alert" className="flex flex-col gap-2 text-sm">
      <p>{t("deleteConfirm", { count: conversations })}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await deleteMarginNote(noteId);
              setConfirming(false);
            })
          }
          className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-60"
        >
          {t("delete")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="min-h-11 rounded-md border border-border px-4"
        >
          {t("deleteCancel")}
        </button>
      </div>
    </div>
  );
}
