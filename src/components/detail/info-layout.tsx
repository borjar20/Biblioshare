import type { ReactNode } from "react";
import { DETAIL_ASIDE_STICKY } from "./detail-container";

// La pestaña Info de las tres fichas (spec 2026-09-23 ficha cinemática §3):
// en PC, una rejilla `principal | datos (340)` con la columna de datos pegada
// bajo la barra de pestañas; en móvil, UNA columna.
//
// En móvil las dos envolturas son `display:contents`: sus hijos pasan a ser
// hijos directos del flex de fuera y cada uno se coloca con su `order-N`. Así el
// orden móvil del plan 06 (que mezcla secciones de las dos columnas: la ficha
// del libro va ENTRE la sinopsis y las ediciones) se conserva sin pintar nada
// dos veces. En PC cada hijo lleva `lg:order-none` y manda el orden del DOM.
export function InfoLayout({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-11">
      <div data-testid="info-main" className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-10">
        {main}
      </div>
      <div
        data-testid="info-aside"
        className={`contents lg:flex lg:flex-col lg:gap-6 ${DETAIL_ASIDE_STICKY}`}
      >
        {aside}
      </div>
    </div>
  );
}
