import type { ReactNode } from "react";

// "Información" tab body: synopsis (+ any extra content such as credits) beside
// the metadata sidebar.
export function InfoPanel({
  aboutLabel,
  synopsis,
  noSynopsisLabel,
  sidebar,
  extra,
  actions,
}: {
  aboutLabel: string;
  synopsis: string | null;
  noSynopsisLabel: string;
  /**
   * Ausente en libro/película: su metadata ahora vive en EditionsSection
   * (arriba de este panel), no aquí al lado de la sinopsis. Sigue en uso
   * tal cual en serie (MetadataSidebar).
   */
  sidebar?: ReactNode;
  extra?: ReactNode;
  /** Botón "Editar ficha" (CatalogEditor), junto al título de esta sección. */
  actions?: ReactNode;
}) {
  const paragraphs = synopsis
    ? synopsis.split(/\n\n+/).filter((p) => p.trim().length > 0)
    : [];

  return (
    // El raíl va a 340px como el del resto de la app, pero además sube de `md:`
    // a `lg:`: a 768px un raíl de 340 dejaba la sinopsis en ~350px de columna,
    // más estrecha que en móvil. Por debajo de lg se apila, que es mejor que
    // dos columnas apretadas.
    <div
      className={`grid items-start gap-8 ${sidebar ? "lg:grid-cols-[1fr_340px]" : ""}`}
    >
      {/* `min-w-0`: una celda de grid vale `min-width:auto`, así que su
          contenido no encoge. Sin esto la tira de reparto (6 avatares de 64px
          = 454px) estiraba la ficha entera a 470px en un viewport de 360 y el
          `overflow-x-auto` de CreditsSection nunca llegaba a actuar (#721). */}
      <div className="flex min-w-0 flex-col gap-4">
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
        {extra}
      </div>
      {sidebar}
    </div>
  );
}
