"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatElapsed } from "@/lib/play/ui/clock";

/**
 * El crono vive AISLADO en su propio componente a propósito: un reloj dentro del
 * componente que escucha el store repinta el tablero entero cada segundo durante
 * horas, y con el wake lock puesto eso es batería que se va sin que nadie la pida.
 * Aquí el intervalo solo re-renderiza este `<span>`.
 *
 * El «ahora» se lee al montar y se refresca solo desde el intervalo: llamar a
 * `Date.now()` en el cuerpo del render viola la regla de pureza de React (mismo
 * patrón que `session-timer.tsx`).
 */
export function GameClock({ startedAt }: { startedAt: number }) {
  const t = useTranslations("play");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const text = formatElapsed(now - startedAt);
  return (
    <span
      className="font-mono text-[11px] tabular-nums text-muted-foreground"
      aria-label={t("console.elapsed", { time: text })}
    >
      {text}
    </span>
  );
}
