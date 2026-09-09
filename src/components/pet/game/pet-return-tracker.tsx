"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isPetRoute, petReturnKey, safePetReturn } from "@/lib/pet/game-navigation";

/** Mounted in authenticated app chrome, outside the game; stores no account data. */
export function PetReturnTracker({ userId }: { userId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (isPetRoute(pathname)) return;
    const path = window.location.pathname + window.location.search + window.location.hash;
    if (safePetReturn(path) !== path) return;
    try { sessionStorage.setItem(petReturnKey(userId), path); } catch { /* Direct entry falls back to Inicio. */ }
  }, [pathname, params, userId]);
  return null;
}
