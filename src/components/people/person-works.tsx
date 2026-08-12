import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole } from "@/lib/people/types";
import type { PersonProfile, ProfileWork } from "@/lib/people/profile-types";
import {
  deriveRoleSections,
  filterWorks,
  groupByYear,
  splitFeaturedAndRest,
} from "@/lib/people/derive-person-works";
import { PersonFilters } from "./person-filters";
import { PersonFeatured } from "./person-featured";
import { PersonWorkRow } from "./person-work-row";
import { PersonWorkCard } from "./person-work-card";
import { ROLE_KEY } from "./role-labels";

const TYPE_ORDER: ItemType[] = ["movie", "series", "book"];

/**
 * La misma lista, en las DOS formas que pide el mockup:
 *
 * - **≥640px** (marco 5): gutter de año a la izquierda y filas de cuatro zonas.
 * - **<640px** (marco 2): rejilla PLANA de 2 columnas con tarjetas, SIN gutter
 *   de año — a 390px la fila deja ~150px para el título después de portada,
 *   chip, estado y valoración, y no se lee. El año se mete en la tarjeta.
 *
 * Sí, los datos se pintan dos veces en el DOM. Es el precio de que las dos
 * formas sean estructuralmente distintas (columna con gutter vs rejilla), y es
 * el mismo patrón que ya usa el repo para los pares `hidden`/`lg:flex`. La
 * trampa conocida de ese patrón —que las dos instancias se vean a la vez si el
 * orden de las clases de Tailwind pierde la pelea, como pasó con `RatingDots`—
 * se evita aquí porque los envoltorios no llevan `flex`/`grid` propio que
 * compita: el de móvil nace `grid` y muere en `sm:hidden`, el de escritorio nace
 * `hidden` y revive en `sm:flex`.
 */
async function YearList({
  works,
  unknownYearLabel,
}: {
  works: ProfileWork[];
  unknownYearLabel: string;
}) {
  const byYear = groupByYear(works);

  return (
    <>
      {/* Plana, pero en el MISMO orden que la de escritorio: año descendente,
          las obras sin año al final. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:hidden">
        {byYear
          .flatMap((group) => group.works)
          .map((work) => (
            <PersonWorkCard key={`${work.itemType}-${work.itemId}`} work={work} />
          ))}
      </div>

      <div className="hidden flex-col gap-3 sm:flex">
        {byYear.map((group) => (
          <div key={String(group.year)} className="flex gap-3">
            <span className="w-[46px] shrink-0 pt-2 font-mono text-[11px] text-muted-foreground">
              {group.year ?? unknownYearLabel}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              {group.works.map((work) => (
                <PersonWorkRow key={`${work.itemType}-${work.itemId}`} work={work} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * El centro: cabecera + filtros + destacadas + lista.
 *
 * Dos reglas dan forma a todo lo de abajo:
 *  - Las DESTACADAS se excluyen de la lista, que por eso se titula "El resto,
 *    por año". Sin la exclusión la misma obra sale dos veces.
 *  - Con "Todo crédito" activo y créditos mixtos de peso (≥3 obras o ≥20%), el
 *    centro se parte en secciones por rol. Al elegir un chip de crédito concreto
 *    la lista se APLANA: ya estás mirando un rol, partir por rol no dice nada.
 */
export async function PersonWorks({
  profile,
  basePath,
  activeType,
  activeRole,
}: {
  profile: PersonProfile;
  basePath: string;
  activeType?: ItemType;
  activeRole?: CreditRole;
}) {
  const t = await getTranslations("person");

  const availableTypes = TYPE_ORDER.filter((type) =>
    profile.works.some((w) => w.itemType === type)
  );
  const visible = filterWorks(profile.works, { type: activeType, role: activeRole });

  const sections = activeRole ? [] : deriveRoleSections(visible);
  const { featured, rest } = splitFeaturedAndRest(visible);
  const restKeys = new Set(rest.map((w) => `${w.itemType}:${w.itemId}`));
  const unknownYear = t("unknownYear");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-[21px] font-semibold text-foreground">
          {t("worksHeading")} <span className="text-muted-foreground">· {visible.length}</span>
        </h2>
        <PersonFilters
          basePath={basePath}
          availableTypes={availableTypes}
          roleCounts={profile.roleCounts}
          activeType={activeType}
          activeRole={activeRole}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("noWorksForFilter")}</p>
      ) : (
        <>
          {featured.length > 0 && <PersonFeatured works={featured} />}

          {sections.length > 0 ? (
            <div className="flex flex-col gap-6">
              {sections.map((section) => {
                // La exclusión de destacadas se aplica TAMBIÉN dentro de cada
                // sección: si no, una destacada volvería a salir aquí abajo y
                // volveríamos al problema que la exclusión resuelve.
                const sectionRest = section.works.filter((w) =>
                  restKeys.has(`${w.itemType}:${w.itemId}`)
                );
                if (sectionRest.length === 0) return null;
                return (
                  <div key={section.role} className="flex flex-col gap-2.5" data-testid="person-rest">
                    <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("sectionAs", { role: t(ROLE_KEY[section.role]) })}
                      {" · "}
                      {t("sectionSummary", {
                        works: section.works.length,
                        done: section.works.filter((w) => w.status === "completed").length,
                      })}
                    </h3>
                    <YearList works={sectionRest} unknownYearLabel={unknownYear} />
                  </div>
                );
              })}
            </div>
          ) : (
            rest.length > 0 && (
              <div className="flex flex-col gap-2.5" data-testid="person-rest">
                <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {featured.length > 0 ? t("restByYear") : t("byYear")}
                </h3>
                <YearList works={rest} unknownYearLabel={unknownYear} />
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
