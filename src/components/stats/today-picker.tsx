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
  heading,
  later,
}: {
  entries: TodayEntry[];
  keepGoingLabel: string;
  /** El rótulo "En curso · N · Ver todos". Va DENTRO de la columna izquierda,
   *  no sobre el bloque entero: manda sobre el destacado y sus mini, igual que
   *  "Para más tarde" manda sobre su estantería. Cruzando las dos columnas, su
   *  "Ver todos" caía a 27px del otro "Ver todos" y con distinto destino. */
  heading?: ReactNode;
  /** "Para más tarde", pintado en servidor: se apila entre el destacado y las
   *  mini de "Continúa". Otro slot, por la misma razón que las tarjetas. */
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
    // Dos áreas: IZQUIERDA el destacado, DERECHA "Para más tarde" + "Continúa"
    // apiladas. `today-split` (globals.css) lo pinta a DOS COLUMNAS cuando la
    // sección tiene ≥560px (mockup C: cabe sin scroll) y APILADO en estrecho
    // —donde el orden queda en curso → para más tarde → continúa, que es como
    // caen los dos bloques uno tras otro—. La columna estrecha de las 3 columnas
    // del Inicio nunca llega a 560, así que ahí se queda apilado.
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

      {/* DERECHA: "Para más tarde" y "Continúa" apiladas. */}
      <div className="flex min-w-0 flex-col gap-3">
        {later}

        {rest.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
              {keepGoingLabel}
            </span>
            {/* `today-shelf`: carrusel de una fila. Móvil estrecho (<768): sangra
                al borde. Tablet/desktop y en la columna derecha del split (≥560):
                contenido (`mx-0`, sin envolver). Solo en las 3 columnas del
                Inicio (≥1100) las mini envuelven en filas. */}
            <div className="today-shelf -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0 min-[1100px]:flex-wrap">
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
    </div>
  );
}
