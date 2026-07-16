import Image from "next/image";
import type { ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

// El rail izquierdo de la ficha en PC (.desk-rail de los frames 8-12): la
// portada grande y, debajo, el panel de control del pase (estado, progreso,
// CTA y tu nota). Solo existe en `lg:` — en móvil manda ItemHero.
//
// Se queda quieto al scrollear con `sticky`, NO con un contenedor de scroll
// propio como la maqueta (P5 del plan 06): se calca el efecto, no la técnica.
// Funciona porque es el único hijo de su columna del grid, así que su bloque
// contenedor es la fila entera.
export function ItemRail({
  itemType,
  title,
  coverUrl,
  actions,
}: {
  itemType: ItemType;
  title: string;
  coverUrl: string | null;
  /** Panel de control del pase; ausente para quien no ha iniciado sesión. */
  actions?: ReactNode;
}) {
  const accent = MEDIA_ACCENT[itemType];

  return (
    <div className="sticky top-[calc(var(--topbar-h)+34px)] self-start py-[34px] pl-10">
      <div
        className={`relative h-[384px] w-64 overflow-hidden rounded-lg border-2 ${accent.border} bg-surface-muted shadow-[0_20px_40px_-16px_rgba(60,35,15,0.55)]`}
      >
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            sizes="256px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {title}
          </div>
        )}
      </div>

      {actions && (
        <div className="mt-[18px] flex w-64 flex-col gap-3">{actions}</div>
      )}
    </div>
  );
}
