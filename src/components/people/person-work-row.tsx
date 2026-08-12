import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RatingDots } from "@/components/ui/rating-dots";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProfileWork } from "@/lib/people/profile-types";
import { ROLE_KEY, STATUS_KEY, TYPE_KEY } from "./role-labels";

// La fila del listado por año. CUATRO ZONAS FIJAS, y su anchura es lo que hace
// que cuarenta filas se lean como una tabla y no como cuarenta tarjetas
// distintas: obra (fluida) · crédito (auto) · estado (118px) · valoración (74px).
export async function PersonWorkRow({ work }: { work: ProfileWork }) {
  const t = await getTranslations("person");

  // Con crédito de reparto manda el PERSONAJE, no el tipo: en la ficha de un
  // intérprete lo que se busca es "¿a quién hacía?".
  const subtitle =
    work.character ??
    [
      t(TYPE_KEY[work.itemType]),
      work.durationMinutes ? t("minutes", { count: work.durationMinutes }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
      <Link href={work.href} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded bg-surface-muted">
          {work.coverUrl && (
            <Image src={work.coverUrl} alt="" fill sizes="30px" className="object-cover" />
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-serif text-[14px] font-medium text-foreground">
            {work.title}
          </span>
          <span className="truncate text-[11.5px] text-muted-foreground">{subtitle}</span>
        </div>
      </Link>

      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {work.roles.map((role) => (
          <span
            key={role}
            className="rounded-full bg-surface-muted px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground"
          >
            {t(ROLE_KEY[role])}
          </span>
        ))}
      </div>

      <div className="hidden w-[118px] shrink-0 justify-start sm:flex">
        {work.status && <StatusBadge status={work.status} label={t(STATUS_KEY[work.status])} />}
      </div>

      <div className="flex w-[74px] shrink-0 justify-end">
        {work.userRating != null ? (
          <RatingDots value={work.userRating} size="sm" itemType={work.itemType} />
        ) : (
          <Link href={work.href} className="text-[11.5px] font-medium text-accent hover:underline">
            {t("rate")}
          </Link>
        )}
      </div>
    </div>
  );
}
