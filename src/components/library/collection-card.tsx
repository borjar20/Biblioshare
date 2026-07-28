import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CollectionCard as CollectionCardData } from "@/lib/library/collections";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

// Posición de cada portada en el abanico (mockup `.fan`/`.colc`): la más
// reciente (`fanCovers[0]`) va centrada y encima; las otras dos se abren en
// abanico a los lados, detrás. Cada slot centra la portada en el contenedor
// (`left-1/2 top-1/2` + `-translate-y-1/2`) y desplaza en X *antes* de
// rotar — Tailwind compone siempre `translate(...) rotate(...)` en ese
// orden, así el desplazamiento ocurre en el eje de pantalla y la rotación
// gira la portada ya desplazada sobre su propio centro (no al revés, que
// daría un desplazamiento diagonal).
const FAN_SLOTS = [
  { x: "-translate-x-1/2", rotate: "" },
  { x: "translate-x-[calc(-50%-22px)]", rotate: "-rotate-[14deg]" },
  { x: "translate-x-[calc(-50%+22px)]", rotate: "rotate-[14deg]" },
];
const FAN_Z = ["z-30", "z-20", "z-10"];

export async function CollectionCard({ card }: { card: CollectionCardData }) {
  const t = await getTranslations("collection");
  const covers = card.fanCovers.slice(0, 3);
  const dotClass = card.dominantType
    ? MEDIA_ACCENT[card.dominantType].bg
    : "bg-muted-foreground";

  return (
    <Link
      href={`/coleccion/c/${card.id}`}
      className="group flex flex-col gap-2.5 rounded-card border border-border bg-surface p-3 shadow-card transition-colors hover:border-accent"
    >
      <div className="relative isolate h-[98px] w-full">
        {covers.map((cover, index) => {
          const slot = FAN_SLOTS[index];
          return (
            <div
              key={index}
              className={`absolute left-1/2 top-1/2 h-[81px] w-[54px] -translate-y-1/2 overflow-hidden rounded-[5px] border border-border bg-surface-muted shadow-cover ${slot.x} ${slot.rotate} ${FAN_Z[index]}`}
            >
              {cover && (
                <Image
                  src={cover}
                  alt=""
                  fill
                  sizes="54px"
                  className="object-cover"
                />
              )}
            </div>
          );
        })}
      </div>

      <span className="line-clamp-1 font-serif text-[15px] font-semibold text-foreground">
        {card.name}
      </span>

      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        {t("titleCount", { count: card.count })}
      </span>
    </Link>
  );
}
