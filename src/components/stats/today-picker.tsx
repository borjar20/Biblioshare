"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

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
  /** Lo que se anuncia al subirla al destacado («Dune, ahora en el destacado»). */
  announceLabel: string;
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

  // Destacar era la interacción firma de la vista y no dejaba rastro para quien
  // no ve la pantalla: el botón pulsado se DESMONTA (sale de `rest`) y el
  // destacado se remonta por `key`, así que el foco caía a <body> —al principio
  // del documento— sin que nada anunciara el cambio. WCAG 2.4.3 y 4.1.3, y
  // PRODUCT.md declara AA como suelo.
  //
  // El foco se lleva al destacado (contenedor con tabIndex -1) y el cambio se
  // dice en una región viva. Solo tras un clic del usuario: `userPicked` evita
  // robar el foco en el primer render de la página.
  const featuredRef = useRef<HTMLDivElement>(null);
  const userPicked = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!userPicked.current) return;
    userPicked.current = false;
    featuredRef.current?.focus();
  }, [selectedId]);

  function pick(entry: TodayEntry) {
    userPicked.current = true;
    setSelectedId(entry.id);
    setAnnouncement(entry.announceLabel);
  }

  // Si la lista cambia bajo los pies (marcas el último episodio y ese título
  // sale de "en curso"), el id guardado puede no existir ya: se cae al primero
  // en vez de dejar el bloque en blanco.
  const featured = entries.find((e) => e.id === selectedId) ?? entries[0];
  if (!featured) return null;
  const rest = entries.filter((e) => e.id !== featured.id);

  return (
    // Una columna principal: arriba el destacado (full-width), debajo las tiras
    // "Continúa" y "Para más tarde". Bajo 1100 esas dos van LADO A LADO en un
    // split asimétrico ("Continúa" 2×2, "Para más tarde" 4×2, las dos solo
    // portada, separadas por un borde vertical); a ≥1100 van apiladas y ricas. Lo
    // pinta `today-shelves` (globals.css). `today-split` es hoy solo un flex-col
    // (el destacado sobre las tiras); el nombre es herencia.
    <div className="today-split flex flex-col gap-3">
      {/* IZQUIERDA: En curso + destacado. */}
      <div className="flex min-w-0 flex-col gap-2">
        {heading}
        {/* `role="status"` (aria-live polite implícito) fuera del subárbol que
            se remonta: si viviera dentro del Fragment con `key`, cada cambio lo
            recrearía y algunos lectores no anuncian un nodo recién insertado. */}
        <p role="status" className="sr-only">
          {announcement}
        </p>
        {/* La key fuerza el REMONTAJE al cambiar de destacado. Sin ella React
            reutiliza el mismo <img> y le cambia el src, pero el navegador sigue
            pintando la portada anterior hasta que descarga la nueva: durante
            unos cientos de ms se veía la portada de un libro bajo el título de
            otro. Vacío mientras carga es honesto; la portada equivocada, no. */}
        <div
          ref={featuredRef}
          tabIndex={-1}
          className="rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Fragment key={featured.id}>{featured.card}</Fragment>
        </div>
      </div>

      {/* "Continúa" y "Para más tarde": apiladas a ≥1100, lado a lado bajo 1100
          en un split asimétrico (2×2 vs 4×2) — lo decide `today-shelves` en
          globals.css. */}
      <div className="today-shelves flex min-w-0 flex-col gap-3">
        {rest.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
              {keepGoingLabel}
            </span>
            {/* `today-shelf-continue`: a ≥1100 es un carrusel/rejilla de tarjetas
                mini que envuelve en la columna estrecha; bajo 1100 se vuelve el
                grid 2×2 de mini-portadas del split lateral (globals.css).

                Cada botón trae DOS vistas: la tarjeta mini (≥1100) y la
                mini-portada (grid lateral, <1100). El CSS enseña una u otra; el
                clic que sube al destacado es el mismo. */}
            <div className="today-shelf today-shelf-continue -mx-5 flex items-start gap-2.5 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0 min-[1100px]:flex-wrap">
              {rest.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-label={entry.focusLabel}
                  onClick={() => pick(entry)}
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
