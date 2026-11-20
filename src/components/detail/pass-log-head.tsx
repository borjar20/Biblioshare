"use client";

import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { useItemStatus } from "./item-status-context";
import { usePassActions } from "./pass-actions-provider";
import { EditionChip } from "./edition-chip";

// Cabecera de «Mi registro» en los tres tipos: «Pase activo», el ordinal, la
// edición (libros y películas) y «Nuevo pase». Antes vivía dentro de
// ManagedLog (log-panel.tsx).
export function PassLogHead({
  itemType,
  itemId,
  entryStatus,
  passes,
  editions,
  canContribute,
}: {
  itemType: ItemType;
  itemId: string;
  entryStatus: MediaStatus;
  passes: Pass[];
  editions: Edition[];
  canContribute: boolean;
}) {
  const tPasses = useTranslations("passes");
  const accent = MEDIA_ACCENT[itemType];
  // El estado se cambia en la tarjeta del hero; aquí solo se lee. El
  // `?? entryStatus` cubre la ventana de «Quitar de mi biblioteca».
  const { status: sharedStatus } = useItemStatus();
  const status = sharedStatus ?? entryStatus;
  const { isPending, newPass } = usePassActions();
  const openPass = passes.find((p) => p.status === "planned" || p.status === "in_progress") ?? null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0">
        <span className="block font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">
          {tPasses("activeLabel")}
        </span>
        <span className="font-serif text-base leading-tight font-semibold">
          {tPasses(`nth.${itemType}`, { n: passes.length })}
        </span>
      </div>
      {openPass && itemType !== "series" && (
        <EditionChip
          key={openPass.id}
          itemType={itemType}
          itemId={itemId}
          openPass={openPass}
          passes={passes}
          editions={editions}
          canContribute={canContribute}
        />
      )}
      {/* «Nuevo pase» no se pinta sobre un pendiente: no hay nada que cerrar. */}
      {status !== "planned" && (
        <button
          type="button"
          disabled={isPending}
          onClick={newPass}
          className={`ml-auto shrink-0 rounded-lg border px-[11px] py-1.5 font-mono text-[10px] font-medium whitespace-nowrap disabled:opacity-60 ${accent.text} ${accent.borderSoft}`}
        >
          {tPasses("newPass")}
        </button>
      )}
    </div>
  );
}
