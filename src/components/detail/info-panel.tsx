import type { ReactNode } from "react";

// La sinopsis de la ficha (con el botón «Editar ficha» junto al título). Desde
// la ficha cinemática el reparto, la ficha técnica y «dónde verla» los coloca
// InfoLayout en su columna; esto ya solo es la sinopsis.
export function InfoPanel({
  aboutLabel,
  synopsis,
  noSynopsisLabel,
  actions,
}: {
  aboutLabel: string;
  synopsis: string | null;
  noSynopsisLabel: string;
  /** Botón "Editar ficha" (CatalogEditor), junto al título de esta sección. */
  actions?: ReactNode;
}) {
  const paragraphs = synopsis
    ? synopsis.split(/\n\n+/).filter((p) => p.trim().length > 0)
    : [];

  return (
    // Tope de lectura: con la columna principal a ~860px, la sinopsis a 14px
    // salía a ~120 caracteres por línea.
    <div className="flex min-w-0 max-w-[68ch] flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{aboutLabel}</h2>
        {actions}
      </div>
      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground">
            {p}
          </p>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">{noSynopsisLabel}</p>
      )}
    </div>
  );
}
