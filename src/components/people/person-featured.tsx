import { getTranslations } from "next-intl/server";
import { CoverCard } from "@/components/ui/cover-card";
import { RatingDots } from "@/components/ui/rating-dots";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProfileWork } from "@/lib/people/profile-types";
import { ROLE_KEY, STATUS_KEY } from "./role-labels";

// Hasta 5 obras destacadas. Las que salen aquí NO se repiten en la lista de
// abajo (ver splitFeaturedAndRest): sin esa exclusión la misma película aparecía
// DOS veces en la misma pantalla, que era el defecto del primer planteamiento.
export async function PersonFeatured({ works }: { works: ProfileWork[] }) {
  const t = await getTranslations("person");

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("featured")}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {works.map((work) => (
          <div key={`${work.itemType}-${work.itemId}`} className="flex flex-col gap-1.5">
            <CoverCard
              href={work.href}
              coverUrl={work.coverUrl}
              title={work.title}
              subtitle={[work.year, t(ROLE_KEY[work.roles[0]])].filter(Boolean).join(" · ")}
            />
            {(work.userRating != null || work.status) && (
              <div className="flex items-center justify-between gap-1">
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
