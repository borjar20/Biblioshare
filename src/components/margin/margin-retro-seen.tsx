"use client";

import { useEffect } from "react";
import { markSeenInChunks } from "./mark-seen";

// Los encuentros retroactivos no abren la hoja de revelación: se marcan vistos
// al montar la ficha. La insignia «Nueva» sigue en este render y desaparece en
// la siguiente visita (sin revalidar). Quien lo monta le da un `key` con los ids.
export function MarginRetroSeen({ ids }: { ids: string[] }) {
  const joined = ids.join(",");
  useEffect(() => {
    if (!joined) return;
    void markSeenInChunks(joined.split(","));
  }, [joined]);
  return null;
}
