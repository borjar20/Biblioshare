"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { useSyncExternalStore } from "react";

// El hostname no cambia durante la vida de este documento. El snapshot de
// servidor/hidratación es false: leer el navegador no vuelve dinámico el layout.
const subscribe = () => () => {};

function isNonLoopbackOrigin() {
  const hostname = window.location.hostname.replace(/\.$/, "");
  return hostname !== "localhost"
    && !hostname.endsWith(".localhost")
    && !/^127(?:\.\d+){3}$/.test(hostname)
    && hostname !== "[::1]";
}

export function LocalAwareSpeedInsights() {
  const enabled = useSyncExternalStore(subscribe, isNonLoopbackOrigin, () => false);
  return enabled ? <SpeedInsights /> : null;
}
