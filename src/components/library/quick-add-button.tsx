"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon, CheckIcon } from "@/components/ui/icons";
import { quickAddToLibrary } from "@/lib/library/quick-add-actions";
import type { ItemType } from "@/lib/catalog/types";

// Botón "+" de alta rápida (feed). Optimista: al pulsar marca "en tu biblioteca"
// y revierte si la acción falla. Idempotente en el servidor.
//
// `inLibrary` es la verdad del servidor. Va como PROP y no como "no renderices el
// botón" en el llamador: el alta rápida revalida `/`, y si el servidor tapaba el
// botón al volver, React lo desmontaba y se llevaba por delante el `added`
// optimista — el usuario se quedaba sin botón Y sin confirmación (issue #384, la
// misma lección que #106: si publicas estado optimista, que sobreviva a su propia
// revalidación).
export function QuickAddButton({
  itemType,
  itemId,
  inLibrary = false,
}: {
  itemType: ItemType;
  itemId: string;
  inLibrary?: boolean;
}) {
  const t = useTranslations("feed");
  const [added, setAdded] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (added || inLibrary) {
    return (
      <span className="inline-flex items-center gap-1.5 self-start font-mono text-[11px] text-muted-foreground">
        <CheckIcon className="h-3.5 w-3.5" /> {t("alreadyInLibrary")}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          setAdded(true);
          try {
            await quickAddToLibrary(itemType, itemId);
          } catch {
            setAdded(false);
          }
        })
      }
      className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-surface-muted disabled:opacity-50"
    >
      <PlusIcon className="h-3.5 w-3.5" /> {t("quickAdd")}
    </button>
  );
}
