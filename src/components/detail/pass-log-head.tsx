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

// El diario comparte cabecera entre medios. Cada entrada identifica su propio pase.
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 empty:hidden">
      {/* Una película sin ediciones y sin permiso para aportar no tiene nada que
          elegir: el selector solo ofrecería «No lo sé». */}
      {openPass && itemType !== "series" && !(itemType === "movie" && editions.length === 0 && !canContribute) && (
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
      {status !== "planned" && status !== "completed" && (
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
