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
export type TodayEntry = { id: string; card: ReactNode; mini: ReactNode; focusLabel: string };

export function TodayPicker({
  entries,
  keepGoingLabel,
}: {
  entries: TodayEntry[];
  keepGoingLabel: string;
}) {
  const [selectedId, setSelectedId] = useState(entries[0]?.id);

  // Si la lista cambia bajo los pies (marcas el último episodio y ese título
  // sale de "en curso"), el id guardado puede no existir ya: se cae al primero
  // en vez de dejar el bloque en blanco.
  const featured = entries.find((e) => e.id === selectedId) ?? entries[0];
  if (!featured) return null;
  const rest = entries.filter((e) => e.id !== featured.id);

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start lg:gap-6">
      {/* La key fuerza el REMONTAJE al cambiar de destacado. Sin ella React
          reutiliza el mismo <img> y le cambia el src, pero el navegador sigue
          pintando la portada anterior hasta que descarga la nueva: durante unos
          cientos de ms se veía la portada de un libro bajo el título de otro.
          Vacío mientras carga es honesto; la portada equivocada, no. */}
      <Fragment key={featured.id}>{featured.card}</Fragment>

      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
            {keepGoingLabel}
          </span>
          {/* Carrusel, no lista: con 5 en curso una lista vertical empujaría el
              feed fuera de la pantalla. El frame G lo dice explícitamente. */}
          <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
            {rest.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-label={entry.focusLabel}
                onClick={() => setSelectedId(entry.id)}
                className="shrink-0 rounded-[12px] text-left transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
              >
                {entry.mini}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
