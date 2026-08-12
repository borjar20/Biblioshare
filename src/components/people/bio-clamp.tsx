"use client";

import { useState } from "react";

// La biografía se recorta a 3 líneas y "Ver más" la expande EN SITIO. No hay
// página de biografía aparte: sacar al lector de la ficha para leer un párrafo
// no compensa.
//
// Es la ÚNICA pieza de cliente de la columna izquierda; todo lo demás de la
// ficha es servidor.
export function BioClamp({
  text,
  moreLabel,
  lessLabel,
}: {
  text: string;
  moreLabel: string;
  lessLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <p
        className={`whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="self-start text-[12px] font-medium text-accent hover:underline"
      >
        {expanded ? lessLabel : moreLabel}
      </button>
    </div>
  );
}
