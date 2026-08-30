import type { ReactNode } from "react";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * «Canto de mesa»: la cinta de seis colores bajo la topbar. Es la marca de la
 * subapp y la ÚNICA licencia visual que se toma — aparece en todo `/partidas*` y en
 * ningún otro sitio de Biblioshare. No decora: son los seis asientos, así que la
 * marca de Partidas es su propio sistema de color.
 *
 * La subapp empieza DENTRO del marco de la app (topbar y barra de cinco intactas).
 * Lo que se come el marco es el tablero, y ese corte es lo que separa «configurar»
 * de «jugar».
 */
export function PlayFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div aria-hidden className="flex h-1.5 w-full shrink-0">
        {SEAT_ACCENT.map((accent) => (
          <span key={accent.varName} className={`${accent.bar} flex-1`} />
        ))}
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
