import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { SkeletonLine } from "@/components/ui/skeleton";
import { ItemTabsSkeleton } from "./item-tabs-skeleton";

// Fallback de la ficha entera mientras se resuelve `id` (params) por debajo del
// boundary (#442). Espeja el ARMAZÓN de ItemShell —la misma rejilla de dos
// pantallas (rail PC + hero móvil) y las medidas fijas de portada—, así que el
// hero deja de bloquear el primer byte y streamea sin salto brusco de layout.
//
// El alto del hero es de contenido variable (el título envuelve a 1-2 líneas),
// así que el CLS no es cero como en la topbar de token fijo (#435); lo que se
// clava son las alturas de portada (174px móvil, 384px rail), que son el suelo
// de cada pantalla y lo que más pesa en el desplazamiento.
export function ItemShellSkeleton({ itemType }: { itemType: ItemType }) {
  const accent = MEDIA_ACCENT[itemType];

  return (
    <div className="mx-auto w-full lg:grid lg:max-w-[1200px] lg:grid-cols-[300px_1fr]">
      {/* Rail PC (espejo de ItemRail): portada 384×256 sticky. */}
      <div className="hidden lg:block">
        <div className="sticky top-[calc(var(--topbar-h)+34px)] self-start py-[34px] pl-10">
          <div
            className={`h-[384px] w-64 animate-pulse rounded-lg border-2 ${accent.border} bg-surface-muted`}
          />
        </div>
      </div>

      <div className="min-w-0 lg:border-l lg:border-border">
        {/* Hero móvil (espejo de ItemHero): barra superior + portada 174×116. */}
        <div className="lg:hidden">
          <div className="relative mx-auto w-full max-w-4xl px-4 pt-3.5 pb-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <SkeletonLine className="w-16" />
              <SkeletonLine className="w-20" />
              {/* Hueco simétrico del menú ⋯, igual que ItemHero. */}
              <span aria-hidden className="h-[34px] w-[34px] shrink-0" />
            </div>
            <div className="mt-2 flex gap-4 sm:mt-4 sm:gap-6">
              <div
                className={`h-[174px] w-[116px] shrink-0 animate-pulse rounded-[6px] border-2 ${accent.border} bg-surface-muted sm:h-[240px] sm:w-40`}
              />
              <div className="min-w-0 flex-1 pt-1.5">
                <SkeletonLine className="w-28" />
                <SkeletonLine className="mt-3 h-6 w-3/4" />
                <SkeletonLine className="mt-2 w-1/2" />
                <SkeletonLine className="mt-4 h-8 w-32" />
              </div>
            </div>
          </div>
        </div>

        {/* Cabecera PC (espejo de ItemHeaderWide): badge + título 44px + byline. */}
        <div className="hidden lg:block">
          <div className="px-11 pt-[34px] pb-6">
            <SkeletonLine className="w-24" />
            <SkeletonLine className="mt-3.5 h-9 w-2/3" />
            <SkeletonLine className="mt-3 w-1/3" />
          </div>
        </div>

        <ItemTabsSkeleton />
      </div>
    </div>
  );
}
