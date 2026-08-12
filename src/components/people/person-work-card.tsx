import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RatingDots } from "@/components/ui/rating-dots";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProfileWork } from "@/lib/people/profile-types";
import { ROLE_KEY, STATUS_KEY } from "./role-labels";

// La obra como TARJETA, para la rejilla de 2 columnas de móvil (mockup marco 2).
//
// En móvil la fila de cuatro zonas no cabe —a 390px quedan ~150px para el título
// después de portada, chip, estado y valoración—, así que el mockup pasa a
// tarjeta y mete el estado y la valoración DENTRO de ella. El subtítulo lleva
// «año · crédito» en vez del tipo: en una rejilla sin gutter de año, el año tiene
// que ir en la tarjeta o se pierde.
export async function PersonWorkCard({ work }: { work: ProfileWork }) {
  const t = await getTranslations("person");

  const subtitle = [work.year, work.roles[0] ? t(ROLE_KEY[work.roles[0]]) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={work.href} className="flex flex-col gap-1.5">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-cover border border-border bg-surface-muted">
        {work.coverUrl && (
          <Image
            src={work.coverUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 160px"
            className="object-cover"
          />
        )}
      </div>
      <span className="line-clamp-2 font-serif text-[13px] font-medium text-foreground">
        {work.title}
      </span>
      <span className="line-clamp-1 text-[11px] text-muted-foreground">{subtitle}</span>
      {(work.userRating != null || work.status) && (
        <div className="flex items-center gap-2">
          {work.userRating != null ? (
            <RatingDots value={work.userRating} size="sm" itemType={work.itemType} />
          ) : (
            work.status && <StatusBadge status={work.status} label={t(STATUS_KEY[work.status])} />
          )}
        </div>
      )}
    </Link>
  );
}
