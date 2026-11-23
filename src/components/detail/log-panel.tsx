"use client";

import { useTranslations } from "next-intl";
import { SessionList } from "@/components/session-list";
import { MarginComposerButton } from "@/components/margin/margin-composer-button";
import { NoteForm } from "@/components/notes/note-form";
import { AddToCollectionSheet } from "@/components/library/add-to-collection-sheet";
import { PassDiary } from "@/components/detail/pass-diary";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { Position } from "@/lib/library/position";
import type { ProgressSession } from "@/lib/sessions/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { PassLogHead } from "./pass-log-head";

export type ManagedEntry = {
  entryId: string;
  status: MediaStatus;
  position: Position;
};

// «Mi registro» de series y películas (los libros usan ReadingLine, spec
// 2026-11-11-ficha-linea-de-lectura): cabecera, sesiones (series), diario de
// pases, notas y «Añadir a colección». El estado, la nota y la acción principal
// son de la tarjeta del hero; aquí no se repiten (sin panel «Progreso»).
export function LogPanel({
  itemType,
  itemId,
  entry,
  passes,
  sessions,
  editions,
  currentYear,
  canContribute = false,
  showMarginAction = false,
}: {
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry | null;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  /** Año en curso, del servidor: decide si las fechas llevan año. */
  currentYear: number;
  canContribute?: boolean;
  showMarginAction?: boolean;
}) {
  if (!entry) return <AddingPlaceholder />;
  const activePass = passes.find((p) => p.isActive) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PassLogHead
        itemType={itemType}
        itemId={itemId}
        entryStatus={entry.status}
        passes={passes}
        editions={editions}
        canContribute={canContribute}
      />
      {itemType !== "movie" && activePass && (
        <SessionList
          passId={activePass.id}
          itemType={itemType}
          itemId={itemId}
          sessions={sessions}
          currentYear={currentYear}
        />
      )}
      <PassDiary itemType={itemType} itemId={itemId} passes={passes} editions={editions} />
      <div className="flex flex-wrap items-center gap-2">
        <NoteForm compact bare itemType={itemType} itemId={itemId} anchor={{ kind: "none" }} />
        <AddToCollectionButton itemType={itemType} itemId={itemId} />
        {showMarginAction && <MarginComposerButton itemType={itemType} itemId={itemId} pages={null} />}
      </div>
    </div>
  );
}

// Ventana transitoria tras elegir una intención en la tarjeta: el estado ya es
// optimista pero la entry del servidor aún no ha llegado.
export function AddingPlaceholder() {
  const t = useTranslations("item");
  return <p className="py-8 text-center text-sm text-muted-foreground">{t("addingToLibrary")}</p>;
}

// «Añadir a colección» (Colección v2 S2). Isla de cliente propia: el trigger es
// una función y ReadingLine (servidor) no puede pasársela a AddToCollectionSheet.
export function AddToCollectionButton({ itemType, itemId }: { itemType: ItemType; itemId: string }) {
  const t = useTranslations("item");
  return (
    <AddToCollectionSheet
      itemType={itemType}
      itemId={itemId}
      renderTrigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="diary-action"
        >
          <span aria-hidden>▤</span>
          {t("collectionAction")}
        </button>
      )}
    />
  );
}
