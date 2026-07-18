import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { CollectionDetail as CollectionDetailData } from "@/lib/library/collections";
import { CollectionItems } from "@/components/library/collection-items";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxIcon } from "@/components/ui/icons";

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
}: {
  detail: CollectionDetailData;
}) {
  const t = await getTranslations("collection");
  const covers = detail.items.slice(0, 3).map((item) => item.coverUrl);
  // Nota media con coma decimal española («4,3», no «4.3»); sin nota media,
  // el meta se queda solo en el recuento (misma clave que el grid, Task 5).
  const meta =
    detail.avgRating === null
      ? t("titleCount", { count: detail.items.length })
      : t("collectionMeta", {
          count: detail.items.length,
          avg: detail.avgRating.toFixed(1).replace(".", ","),
        });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {covers.length > 0 && (
          <div className="relative h-[78px] w-[96px]">
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
        <EmptyState
          glyph={<InboxIcon className="h-7 w-7" />}
          title={t("emptyDetail")}
        />
      ) : (
        <CollectionItems items={detail.items} />
      )}
    </div>
  );
}
