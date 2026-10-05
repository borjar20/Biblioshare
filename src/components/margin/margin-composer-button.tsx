"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { MarginNoteSheet } from "./margin-note-sheet";

// «Dejar una nota en el margen» desde la ficha. `pages` es solo una pista para
// el umbral; la proporción real la fija createMarginNote en el servidor.
export function MarginComposerButton({
  itemType,
  itemId,
  pages,
}: {
  itemType: ItemType;
  itemId: string;
  pages: number | null;
}) {
  const t = useTranslations("margin");
  const [open, setOpen] = useState(false);
  const onClose = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm hover:bg-surface-muted"
      >
        {t("leaveFromDetail")}
      </button>
      <MarginNoteSheet open={open} onClose={onClose} itemType={itemType} itemId={itemId} pages={pages} />
    </>
  );
}
