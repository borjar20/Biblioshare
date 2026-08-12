import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole } from "@/lib/people/types";
import type { WorkOrder } from "@/lib/people/derive-person-works";
import {
  FILTER_TYPE_KEY,
  ORDER_KEY,
  ORDER_SLUG,
  ROLE_KEY,
  ROLE_SLUG,
  TYPE_SLUG,
} from "./role-labels";

function chipClass(active: boolean): string {
  return [
    // `shrink-0` para que en móvil, dentro del contenedor con scroll horizontal,
    // los chips no se compriman hasta ser ilegibles.
    "shrink-0 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
    active
      ? "border-accent bg-accent/10 font-medium text-accent"
      : "border-border text-muted-foreground hover:text-foreground",
  ].join(" ");
}

// Los tres ejes viajan JUNTOS en la URL: cambiar de orden no puede tirarte el
// filtro de tipo, ni al revés. El valor por defecto de cada uno se omite del
// enlace para que la URL compartida no lleve ruido.
function buildHref(base: string, type?: string, role?: string, order?: WorkOrder): string {
  const params = new URLSearchParams();
  if (type) params.set("tipo", type);
  if (role) params.set("credito", role);
  if (order && order !== "chronology") params.set("orden", ORDER_SLUG[order]);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Los filtros son `<Link>`, no estado de cliente: el filtrado ocurre en servidor
 * y así el enlace desde la ficha de un título puede llegar PREFILTRADO
 * (`/persona/x?tipo=peliculas&credito=direccion`) y el botón "atrás" del
 * navegador funciona.
 *
 * Solo se pintan los tipos que la persona TIENE: un chip "Libros" en la ficha de
 * un director es ruido que nunca dará resultados. Igual con los roles.
 *
 * El ORDEN (cronología / por categoría) solo aparece si hay más de un rol: en la
 * ficha de alguien que solo dirige, agrupar por categoría da un único bloque
 * llamado «Dirección» con toda la lista dentro, que es exactamente lo mismo que
 * la cronología pero con una etiqueta de más.
 */
export async function PersonFilters({
  basePath,
  availableTypes,
  roleCounts,
  activeType,
  activeRole,
  activeOrder,
}: {
  basePath: string;
  availableTypes: ItemType[];
  roleCounts: Array<{ role: CreditRole; count: number }>;
  activeType?: ItemType;
  activeRole?: CreditRole;
  activeOrder: WorkOrder;
}) {
  const t = await getTranslations("person");
  const roleSlug = activeRole ? ROLE_SLUG[activeRole] : undefined;
  const typeSlug = activeType ? TYPE_SLUG[activeType] : undefined;

  const showTypes = availableTypes.length > 1;
  const showRoles = roleCounts.length > 1;
  // Con un chip de crédito activo ya estás mirando UNA categoría: ofrecer
  // «agrupar por categoría» sobre una sola no dice nada.
  const showOrder = roleCounts.length > 1 && !activeRole;
  if (!showTypes && !showRoles && !showOrder) return null;

  return (
    // `min-w-0 max-w-full` NO es decorativo: un hijo de flex tiene
    // `min-width:auto`, así que sin esto la tira crece hasta lo que midan sus
    // chips (`shrink-0`) y el `overflow-x-auto` no llega a recortar nada —
    // saca la PÁGINA de la ventana en móvil en vez de scrollear ella. Se vio al
    // añadir los chips de orden, pero el fallo ya estaba: bastaba una persona
    // con cuatro roles.
    <div className="flex min-w-0 max-w-full items-center gap-3 overflow-x-auto">
      {showTypes && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href={buildHref(basePath, undefined, roleSlug, activeOrder)}
            className={chipClass(!activeType)}
          >
            {t("filterTypeAll")}
          </Link>
          {availableTypes.map((type) => (
            <Link
              key={type}
              href={buildHref(basePath, TYPE_SLUG[type], roleSlug, activeOrder)}
              className={chipClass(activeType === type)}
            >
              {t(FILTER_TYPE_KEY[type])}
            </Link>
          ))}
        </div>
      )}

      {showTypes && showRoles && <div className="h-5 w-px shrink-0 bg-border" />}

      {showRoles && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href={buildHref(basePath, typeSlug, undefined, activeOrder)}
            className={chipClass(!activeRole)}
          >
            {t("filterCreditAll")}
          </Link>
          {roleCounts.map(({ role, count }) => (
            <Link
              key={role}
              href={buildHref(basePath, typeSlug, ROLE_SLUG[role], activeOrder)}
              className={chipClass(activeRole === role)}
            >
              {t(ROLE_KEY[role])} · {count}
            </Link>
          ))}
        </div>
      )}

      {showOrder && (
        <>
          <div className="h-5 w-px shrink-0 bg-border" />
          <div className="flex shrink-0 items-center gap-1.5">
            {(["chronology", "role"] as const).map((order) => (
              <Link
                key={order}
                href={buildHref(basePath, typeSlug, roleSlug, order)}
                className={chipClass(activeOrder === order)}
              >
                {t(ORDER_KEY[order])}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
