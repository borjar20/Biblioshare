import { getTranslations } from "next-intl/server";
import { CoverCard } from "@/components/ui/cover-card";
import { RatingDots } from "@/components/ui/rating-dots";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProfileWork } from "@/lib/people/profile-types";
import { strongestRole } from "@/lib/people/credit-noise";
import { ROLE_KEY, STATUS_KEY } from "./role-labels";

// Hasta 5 obras destacadas. Desde el 2026-08-12 SÍ vuelven a salir en la
// filmografía de abajo (petición del dueño): esta tira es un atajo —«por aquí se
// empieza»—, no un cajón donde meter cinco obras y sacarlas del recorrido
// cronológico. Antes se excluían, y el precio era una filmografía a la que le
// faltaban justo sus cinco títulos más importantes.
export async function PersonFeatured({ works }: { works: ProfileWork[] }) {
  const t = await getTranslations("person");

  return (
    <section className="flex flex-col gap-2.5" data-testid="person-featured">
      <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("featured")}
      </h3>
      {/* Móvil: CARRUSEL horizontal (mockup marco 2). Cinco destacadas en una
          rejilla de 2 columnas empujarían la lista de abajo fuera de la primera
          pantalla, que es justo lo que se quiere ver. Desde `sm` vuelve a ser
          rejilla y las tarjetas dejan de llevar ancho fijo. */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {works.map((work) => (
          // Todas las tarjetas MIDEN LO MISMO y su fila de nota queda a la
          // misma altura. Un título de una línea y otro de dos movían cada
          // fila de nota a su aire y la tira se leía descuadrada: de ahí el
          // título de altura reservada (`fixedTitleHeight`) y el `mt-auto`,
          // que ancla la nota al pie aunque algo de arriba crezca.
          <div
            key={`${work.itemType}-${work.itemId}`}
            data-testid="featured-card"
            className="flex h-full w-[132px] shrink-0 flex-col gap-1.5 sm:w-auto sm:shrink"
          >
            <CoverCard
              href={work.href}
              coverUrl={work.coverUrl}
              title={work.title}
              subtitle={[work.year, t(ROLE_KEY[strongestRole(work.roles)])]
                .filter(Boolean)
                .join(" · ")}
              fixedTitleHeight
            />
            {(work.userRating != null || work.status) && (
              <div className="mt-auto flex items-center justify-between gap-1">
                {work.userRating != null ? (
                  <RatingDots value={work.userRating} size="sm" itemType={work.itemType} />
                ) : (
                  <span />
                )}
                {work.status && (
                  <StatusBadge status={work.status} label={t(STATUS_KEY[work.status])} dotOnly />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
