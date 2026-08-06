"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { timeAgo } from "@/lib/relative-time";

// "hace X" que SE REFRESCA solo. Antes cada tarjeta llamaba a `timeAgo(iso, t)`
// en su render y envolvía el nodo en `suppressHydrationWarning`: el valor se
// congelaba en el primer pintado y una pestaña abierta una hora seguía diciendo
// "hace 2 minutos" (issue #351a). Aquí un intervalo fuerza el re-cálculo cada
// minuto — la granularidad del propio texto, así que no tiene sentido tickear
// más fino.
//
// Se mantiene `suppressHydrationWarning`: `timeAgo` mira `Date.now()`, que
// difiere entre el SSR y el primer render del cliente por diseño; el intervalo
// no elimina esa discrepancia del primer paint, solo la corrige enseguida.
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const t = useTranslations("time");
  // El estado es solo un contador para re-renderizar; el valor se deriva de
  // `iso` + el reloj en cada render. setState va en el callback del intervalo
  // (asíncrono), no en el cuerpo del efecto, así que no dispara
  // react-hooks/set-state-in-effect.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span suppressHydrationWarning className={className}>
      {timeAgo(iso, t)}
    </span>
  );
}
