"use client";

import { useEffect } from "react";

// El service worker SOLO se registra en producción. En desarrollo estorba: los
// estáticos de `next dev` no llevan hash estable, así que cachearlos pisa al
// bundler y al HMR, y un SW instalado hace semanas sigue sirviendo código viejo
// en localhost sin que nadie lo sospeche. Por eso, además de no registrarlo, se
// DESREGISTRA y se vacían sus cachés: hasta hoy se registraba en todos los
// entornos, así que el SW envenenado de v2 está ya instalado en el navegador de
// cualquiera que haya abierto la app en local.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}
