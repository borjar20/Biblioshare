"use client";

import { useEffect, useState } from "react";

// Tick de UI: re-render periódico mientras algo corre. El cómputo del tiempo
// NO depende de este tick (remainingAt deriva de timestamps) — solo refresca
// lo que se ve. 250 ms: el segundo visible nunca llega >0,25 s tarde.
export function useNow(enabled: boolean, stepMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [enabled, stepMs]);
  return now;
}
