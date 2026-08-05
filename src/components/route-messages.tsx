import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es.json";

// Namespaces SIEMPRE presentes en cualquier ruta: los del chrome (topbar, barra
// inferior, campana) más los comunes diminutos. El provider raíz manda solo
// esto; el resto lo añade cada ruta con su `<RouteMessages ns={…}>`.
const BASE = ["nav", "notifications", "common", "time", "errors", "push"] as const;

type Messages = Record<string, unknown>;

// El pick corre en SERVIDOR (este componente no es "use client"): el `import`
// del es.json entero se queda en el bundle de servidor y solo el subconjunto
// elegido se serializa al provider de cliente. Manual porque next-intl v4 ya no
// exporta `pick` (el ejemplo del issue #444 estaba desactualizado).
function pickMessages(ns: readonly string[]): Messages {
  const all = messages as Messages;
  const out: Messages = {};
  for (const key of new Set([...BASE, ...ns])) {
    if (key in all) out[key] = all[key];
  }
  return out;
}

// Provider de i18n POR RUTA (#444): en vez de mandar los 42 namespaces (~89 KB)
// en el payload RSC de TODAS las páginas —lo que hacía el provider raíz sin
// `messages`—, cada ruta envía solo el subconjunto que su subárbol de cliente
// usa de verdad. Los providers anidados de next-intl NO mergean con el padre
// (pasar `messages` REEMPLAZA), así que este incluye BASE + los `ns` de la ruta.
// `now`/`locale`/`timeZone` sí se heredan del provider raíz (los deja el wrapper
// de servidor), así que el reloj compartido de las fechas relativas no se rompe.
export function RouteMessages({
  ns = [],
  children,
}: {
  ns?: readonly string[];
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider messages={pickMessages(ns) as never}>
      {children}
    </NextIntlClientProvider>
  );
}
