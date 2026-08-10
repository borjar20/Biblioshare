"use client";

import { Fragment, useState, type ReactNode } from "react";

// Quién va arriba. Las mini NO llevan a la ficha: te ponen ese título en el
// destacado y bajan el que estaba (decisión del usuario, 2026-07-17). El bloque
// es para ACTUAR —cronómetro, marcar episodio—, así que un clic aquí debe
// acercarte la acción, no sacarte de la portada; a la ficha se va desde el
// título o la portada del destacado, que siguen siendo enlaces.
//
// Las tarjetas llegan ya pintadas por el servidor (slots) en vez de recibir los
// datos y pintarse aquí: así el bloque entero sigue siendo servidor —con sus
// traducciones y sus imágenes— y el cliente solo decide cuál se enseña. Son
// pocas (lo que tengas a medias), así que pintarlas todas sale más barato que
// una consulta por cada clic.
// `focusLabel` viene ya formateado ("Poner Dune arriba") por entrada, no como
// una función que lo construya: una función NO cruza la frontera
// servidor→cliente. Es la misma regla que impide pasar `t` hacia dentro.
export type TodayEntry = {
  id: string;
  card: ReactNode;
  mini: ReactNode;
  /** Mini-portada (solo carátula) para el modo compacto. */
  thumb: ReactNode;
  focusLabel: string;
};

export function TodayPicker({
  entries,
  keepGoingLabel,
  heading,
  later,
}: {
  entries: TodayEntry[];
  keepGoingLabel: string;
  /** El rótulo "En curso · N · Ver todos". Va pegado al destacado, no sobre el
   *  bloque entero: manda sobre el destacado y sus mini, igual que "Para más
   *  tarde" manda sobre su estantería. */
  heading?: ReactNode;
  /** "Para más tarde", pintado en servidor: se apila debajo de "Continúa", al
   *  final de la columna derecha. Otro slot, por la misma razón que las tarjetas. */
  later?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(entries[0]?.id);

  // Si la lista cambia bajo los pies (marcas el último episodio y ese título
  // sale de "en curso"), el id guardado puede no existir ya: se cae al primero
  // en vez de dejar el bloque en blanco.
  const featured = entries.find((e) => e.id === selectedId) ?? entries[0];
  if (!featured) return null;
  const rest = entries.filter((e) => e.id !== featured.id);

  return (
    // Dos bloques APILADOS, en una sola columna a todos los tamaños: arriba el
    // destacado, debajo "Continúa" + "Para más tarde". El orden es en curso →
    // continúa → para más tarde. `today-split` (globals.css) hoy es solo un
    // flex-col; el nombre es herencia del reparto a dos columnas que había en la
    // fila de tablet, ya retirada.
    <div className="today-split flex flex-col gap-3">
      {/* IZQUIERDA: En curso + destacado. */}
      <div className="flex min-w-0 flex-col gap-2">
        {heading}
        {/* La key fuerza el REMONTAJE al cambiar de destacado. Sin ella React
            reutiliza el mismo <img> y le cambia el src, pero el navegador sigue
            pintando la portada anterior hasta que descarga la nueva: durante
            unos cientos de ms se veía la portada de un libro bajo el título de
            otro. Vacío mientras carga es honesto; la portada equivocada, no. */}
        <Fragment key={featured.id}>{featured.card}</Fragment>
      </div>

      {/* DERECHA: "Continúa" y "Para más tarde" apiladas. */}
      <div className="flex min-w-0 flex-col gap-3">
        {rest.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
              {keepGoingLabel}
            </span>
            {/* `today-shelf`: carrusel de una fila. Móvil estrecho (<768): sangra
                al borde. De 768 en adelante: contenido (`mx-0`, sin envolver).
                Solo en las 3 columnas del Inicio (≥1100) las mini envuelven en
                filas.

                Cada botón trae DOS vistas: la tarjeta mini (por defecto, ≥1100) y
                la mini-portada (tira slim, <1100). El CSS enseña una u otra; el
                clic que sube al destacado es el mismo. */}
            <div className="today-shelf -mx-5 flex items-start gap-2.5 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0 min-[1100px]:flex-wrap">
              {rest.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-label={entry.focusLabel}
                  onClick={() => setSelectedId(entry.id)}
                  className="continue-item shrink-0 rounded-[12px] text-left transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
                >
                  <span className="continue-card">{entry.mini}</span>
                  <span className="continue-thumb">{entry.thumb}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {later}
      </div>
    </div>
  );
}
