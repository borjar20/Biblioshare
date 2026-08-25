import Link from "next/link";
import type { SagaMembership } from "@/lib/sagas/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { ItemType } from "@/lib/catalog/types";
import { ChevronRightIcon } from "@/components/ui/icons";

// Las sagas del ítem como filas (.saga-row en móvil, .desk-sagas .sr en PC).
//
// Las dos vistas enseñan cosas distintas y por eso la lista recibe TODAS y
// esconde por breakpoint, en vez de que la página pase dos arrays:
//
// - Móvil (frame 1): arriba va la tira de portadas de la saga principal
//   (SagaStrip) y aquí solo LAS DEMÁS — la principal ya está contada arriba.
// - PC (frame 8): no hay tira; TODAS son filas en dos columnas, y la
//   principal se marca teñida.
export function SagaList({
  itemType,
  sagas,
  positionLabel,
}: {
  itemType: ItemType;
  /** Todas, la principal primero. */
  sagas: SagaMembership[];
  /** "nº {position} de {total}" ya traducido, por saga. */
  positionLabel: (saga: SagaMembership) => string | null;
}) {
  const accent = MEDIA_ACCENT[itemType];
  if (sagas.length === 0) return null;

  // Las dos columnas de PC son para cuando hay sagas que emparejar. Con UNA
  // sola, la segunda columna se queda vacía y el nombre se trunca a media fila
  // ("Batman …", "Nacido…") teniendo el ancho al lado sin usar.
  const columns = sagas.length > 1 ? "lg:grid lg:grid-cols-2" : "lg:grid lg:grid-cols-1";

  return (
    <div className={`flex flex-col lg:gap-x-5 lg:gap-y-2 ${columns}`}>
      {sagas.map((saga, index) => {
        const isMain = index === 0;
        const label = positionLabel(saga);
        return (
          <Link
            key={saga.sagaId}
            href={`/saga/${saga.sagaId}`}
            className={`flex items-center gap-2.5 border-b border-border py-3 lg:rounded-[10px] lg:border lg:px-3.5 lg:py-2.5 ${
              isMain
                ? `hidden lg:flex ${accent.border} ${accent.bgSoft}`
                : "lg:border-border lg:bg-surface"
            }`}
          >
            <span
              className={`min-w-0 truncate text-[13px] font-semibold lg:text-[13.5px] ${
                isMain ? accent.text : "text-foreground"
              }`}
            >
              {saga.name}
            </span>
            {label && (
              <span className="ml-auto shrink-0 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                {label}
              </span>
            )}
            <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Link>
        );
      })}
    </div>
  );
}
