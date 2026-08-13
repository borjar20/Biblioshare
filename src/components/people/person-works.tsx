import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole } from "@/lib/people/types";
import type { PersonProfile } from "@/lib/people/profile-types";
import { filterWorks, groupWorks, pickFeatured, type WorkOrder } from "@/lib/people/derive-person-works";
import { PersonFilters } from "./person-filters";
import { PersonFeatured } from "./person-featured";
import { PersonTimelineRow } from "./person-timeline-row";
import { ROLE_KEY } from "./role-labels";

const TYPE_ORDER: ItemType[] = ["movie", "series", "book"];

/**
 * El centro: cabecera + filtros + destacadas + la filmografía.
 *
 * **Las destacadas ya NO se excluyen de la lista** (petición del dueño, enmienda
 * a la decisión del 2026-08-12). La tira de arriba es un atajo —«por aquí se
 * empieza»—, no un cajón donde meter cinco obras y sacarlas del recorrido; una
 * filmografía a la que le faltan sus cinco títulos más importantes no es una
 * filmografía. Por eso la lista se titula ya solo por su orden, sin «el resto».
 *
 * **Una sola columna vertical**, agrupada por año o por categoría según el
 * chip de orden, y con un ancho máximo: sin el tope, a 1700px la fila estiraba
 * el título a la izquierda y el estado a la derecha con medio metro de vacío en
 * medio, y emparejarlos costaba barrer la fila entera con la vista.
 */
export async function PersonWorks({
  profile,
  basePath,
  activeType,
  activeRole,
  activeOrder,
  loggedIn,
}: {
  profile: PersonProfile;
  basePath: string;
  activeType?: ItemType;
  activeRole?: CreditRole;
  activeOrder: WorkOrder;
  loggedIn: boolean;
}) {
  const t = await getTranslations("person");

  const availableTypes = TYPE_ORDER.filter((type) =>
    profile.works.some((w) => w.itemType === type)
  );
  const visible = filterWorks(profile.works, { type: activeType, role: activeRole });
  const featured = pickFeatured(visible);
  const groups = groupWorks(visible, activeOrder);
  const unknownYear = t("unknownYear");

  return (
    <section className="flex max-w-[860px] flex-col gap-4">
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
          activeOrder={activeOrder}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("noWorksForFilter")}</p>
      ) : (
        <>
          {featured.length > 0 && <PersonFeatured works={featured} />}

          <div className="flex flex-col gap-2.5" data-testid="person-rest">
            <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {activeOrder === "role" ? t("byRole") : t("byYear")}
            </h3>

            <div className="flex flex-col">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col">
                  {/* Agrupando por categoría, la etiqueta del tramo va ARRIBA y
                      no en el canal: «Dirección» no cabe en 52px, y el canal
                      sigue siendo del año de cada obra. */}
                  {group.role && (
                    <h4 className="grid grid-cols-[38px_1fr] sm:grid-cols-[52px_1fr]">
                      <span />
                      <span className="border-l border-border py-2 pl-3 font-mono text-[10px] uppercase tracking-wide text-foreground sm:pl-4">
                        {t(ROLE_KEY[group.role])}
                      </span>
                    </h4>
                  )}

                  {group.works.map((work, index) => (
                    <PersonTimelineRow
                      key={`${work.itemType}-${work.itemId}`}
                      work={work}
                      // En cronología el canal lo abre la primera obra del año.
                      // Por categoría, CADA obra lleva su año: dentro del tramo
                      // se repiten y saltan, y sin el año la lista dejaría de
                      // leerse como una filmografía.
                      yearLabel={
                        group.role
                          ? (work.year ? String(work.year) : unknownYear)
                          : index === 0
                            ? (group.year ? String(group.year) : unknownYear)
                            : null
                      }
                      loggedIn={loggedIn}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
