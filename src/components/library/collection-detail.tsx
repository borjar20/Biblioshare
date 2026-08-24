import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { CollectionDetail as CollectionDetailData } from "@/lib/library/collections";
import { CollectionItems } from "@/components/library/collection-items";
import { HiddenDroppedNote } from "@/components/library/hidden-dropped-note";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxIcon } from "@/components/ui/icons";
import { formatDots } from "@/lib/rating/dots";

// Abanico de la cabecera (`dethead`, frame B de `Paper - Colección v2.html`):
// las 3 portadas más recientes de la colección (`getCollection` ya las
// entrega ordenadas por `position`/`added_at` en `items`), a un tamaño mayor
// que el de `CollectionCard` (96×78, portadas 46×69) y con las rotaciones
// del mockup: -12°/0°/12°, ±18px. Mismo orden que `CollectionCard`
// (`fanCovers[0]` centrada y al frente, las otras dos abiertas detrás a los
// lados) para que 1-2 portadas degraden bien en vez de quedar descentradas.
// Mismo truco de composición: `translate(...)` antes de `rotate(...)` para
// que el desplazamiento sea en el eje de pantalla.
const FAN_SLOTS = [
  { x: "-translate-x-1/2", rotate: "" },
  { x: "translate-x-[calc(-50%-18px)]", rotate: "-rotate-[12deg]" },
  { x: "translate-x-[calc(-50%+18px)]", rotate: "rotate-[12deg]" },
];
const FAN_Z = ["z-30", "z-10", "z-20"];

export async function CollectionDetail({
  detail,
  showDroppedHref,
}: {
  detail: CollectionDetailData;
  showDroppedHref: string;
}) {
  const t = await getTranslations("collection");
  const covers = detail.items.slice(0, 3).map((item) => item.coverUrl);
  // `avgRating` sale de `getCollection` en la escala CRUDA de `passes` (1–10);
  // `formatDots` es el único módulo que conoce la equivalencia y la pasa a la
  // escala de 5 dots que usa el resto de la app (RatingDots, media de
  // comunidad, /estadisticas) — sin esto la colección era la única pantalla
  // que enseñaba «9,0» donde en todas las demás esa misma nota es «4,5».
  // Sin nota media, el meta se queda solo en el recuento (misma clave que el
  // grid, Task 5).
  const meta =
    detail.avgRating === null
      ? t("titleCount", { count: detail.items.length })
      : t("collectionMeta", {
          count: detail.items.length,
          // `!`: en esta rama `detail.avgRating` ya es `number` (el ternario de
          // arriba lo comprobó), así que `formatDots` nunca devuelve `null`
          // aquí -- pero su firma general sí lo permite para `rating: null`.
          avg: formatDots(detail.avgRating)!,
        });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {covers.length > 0 && (
          <div className="relative isolate h-[78px] w-[96px]">
            {covers.map((cover, index) => {
              const slot = FAN_SLOTS[index];
              return (
                <div
                  key={index}
                  className={`absolute left-1/2 top-1/2 h-[69px] w-[46px] -translate-y-1/2 overflow-hidden rounded-[5px] border border-border bg-surface-muted shadow-cover ${slot.x} ${slot.rotate} ${FAN_Z[index]}`}
                >
                  {cover && (
                    <Image
                      src={cover}
                      alt=""
                      fill
                      sizes="46px"
                      className="object-cover"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <h1 className="font-serif text-[22px] font-semibold text-foreground">
          {detail.name}
        </h1>

        <p className="font-mono text-xs tracking-wide text-muted-foreground">
          {meta}
        </p>

        {detail.description && (
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {detail.description}
          </p>
        )}
      </div>

      {/* Con ítems: rejilla + desplegable de filtros (tipo/estado/orden) en
          cliente (CollectionItems). Sin ítems: estado vacío. */}
      {detail.items.length === 0 ? (
        <div className="flex flex-col gap-3">
          <EmptyState
            glyph={<InboxIcon className="h-7 w-7" />}
            title={t("emptyDetail")}
          />
          {/* Una colección entera de abandonados no puede parecer una colección
              vacía: sin esto no habría forma de saber que hay algo detrás. */}
          <HiddenDroppedNote
            count={detail.hiddenDropped}
            href={showDroppedHref}
          />
        </div>
      ) : (
        <CollectionItems
          items={detail.items}
          hiddenDropped={detail.hiddenDropped}
          showDroppedHref={showDroppedHref}
        />
      )}
    </div>
  );
}
