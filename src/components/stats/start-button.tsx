"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { updateStatus } from "@/lib/library/manage-actions";
import { buttonVariants } from "@/components/ui/button";

// "Empezar": marca el ítem como en curso y refresca en sitio. Para un pase
// planned o completed, planTransition devuelve siempre `done` (updateActive o
// archiveAndCreate) — nunca askResume, que solo lo dispara `dropped`, y esos
// no llegan aquí (estado 3 solo sugiere completados). Así que no hace falta
// abrir la hoja de retomar: se refresca y el bloque pasa solo a "En curso".
export function StartButton({
  itemType,
  itemId,
  label,
  className,
}: {
  itemType: ItemType;
  itemId: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await updateStatus(itemType, itemId, "in_progress");
          router.refresh();
        })
      }
      className={className ?? buttonVariants("primary")}
    >
      {label}
    </button>
  );
}
