import Link from "next/link";
import type { SagaMembership } from "@/lib/sagas/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { ItemType } from "@/lib/catalog/types";
import { ChevronRightIcon } from "@/components/ui/icons";

// Las sagas del ítem como filas (.saga-row en móvil, .desk-sagas .sr en PC).
//
// `stripShown` decide si la principal se repite en la lista, a CUALQUIER
// ancho: la tira de portadas (SagaStrip) se pinta en las dos vistas, no solo
// en móvil. Con la tira visible, la principal ya se ve ahí y su fila en la
// lista se esconde (`hidden`, sin importar el breakpoint). Sin tira, la
// principal sale como una fila más — teñida con el acento — también en
// móvil.
export function SagaList({
  itemType,
  sagas,
  positionLabel,
  stripShown,
}: {
  itemType: ItemType;
  /** Todas, la principal primero. */
  sagas: SagaMembership[];
  /** "nº {position} de {total}" ya traducido, por saga. */
  positionLabel: (saga: SagaMembership) => string | null;
  /**
   * ¿Se está pintando la tira de portadas (SagaStrip) de la principal? Si sí,
   * la principal ya se ve ahí y no se repite en la lista, a ningún ancho. Antes
   * la tira era solo de móvil y la fila principal se escondía SOLO en móvil
   * (`hidden lg:flex`), así que una saga sin tira quedaba sin ninguna de las dos.
   */
  stripShown: boolean;
}) {
  const accent = MEDIA_ACCENT[itemType];
  if (sagas.length === 0) return null;
  // Con la tira visible y una sola saga no queda nada que listar.
  if (stripShown && sagas.length === 1) return null;

  // Las dos columnas de PC son para cuando hay sagas que emparejar. Con UNA
  // sola VISIBLE, la segunda columna se queda vacía y el nombre se trunca a
  // media fila ("Batman …", "Nacido…") teniendo el ancho al lado sin usar. Lo
  // que cuenta es lo visible, no `sagas.length`: con la tira mostrada, la
  // principal no pinta fila (ver arriba), así que 2 sagas + tira son 1 fila
  // visible y deben caer a una columna, no a dos.
  const visible = sagas.length - (stripShown ? 1 : 0);
  const columns = visible > 1 ? "lg:grid lg:grid-cols-2" : "lg:grid lg:grid-cols-1";

  // Sin tira, la fila principal lleva el borde/fondo teñidos del acento. En
  // móvil no hay padding horizontal en la fila (solo `border-b py-3`), así
  // que un tinte sin escopar se ve como una banda de color con el texto a
  // ras — se escopa a `lg:` para que en móvil la fila luzca como las demás
  // (borde inferior, sin tinte) y solo el nombre se distinga por su color.
  const lgOnly = (classes: string) =>
    classes
      .split(" ")
      .map((c) => `lg:${c}`)
      .join(" ");

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
                ? stripShown
                  ? "hidden"
                  : `${lgOnly(accent.border)} ${lgOnly(accent.bgSoft)}`
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
