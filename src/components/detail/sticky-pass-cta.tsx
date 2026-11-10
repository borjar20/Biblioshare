"use client";

import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { primaryAction } from "@/lib/passes/pass-actions";
import { useItemStatus } from "./item-status-context";
import { usePassActions } from "./pass-actions-provider";

// La versión compacta del botón principal de PassCard, para la barra de
// pestañas cuando se pega arriba (spec 2026-09-23 §1): la tarjeta no acompaña
// al scroll, esto sí. Mismo texto y misma acción (runPrimary); solo con pase.
// ItemDetailTabs decide CUÁNDO se ve.
export function StickyPassCta({ itemType }: { itemType: ItemType }) {
  const t = useTranslations("item");
  const { status } = useItemStatus();
  const { isPending, runPrimary } = usePassActions();
  if (!status) return null;
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={runPrimary}
      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {t(`action.${primaryAction(itemType, status)}.${itemType}`)}
    </button>
  );
}
