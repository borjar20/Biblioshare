import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { CreditRole } from "@/lib/people/types";
import { FILTER_TYPE_KEY, ROLE_KEY, ROLE_SLUG, TYPE_SLUG } from "./role-labels";

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

function buildHref(base: string, type?: string, role?: string): string {
  const params = new URLSearchParams();
  if (type) params.set("tipo", type);
  if (role) params.set("credito", role);
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
 */
export async function PersonFilters({
  basePath,
  availableTypes,
  roleCounts,
  activeType,
  activeRole,
}: {
  basePath: string;
  availableTypes: ItemType[];
  roleCounts: Array<{ role: CreditRole; count: number }>;
  activeType?: ItemType;
  activeRole?: CreditRole;
}) {
  const t = await getTranslations("person");
  const roleSlug = activeRole ? ROLE_SLUG[activeRole] : undefined;
  const typeSlug = activeType ? TYPE_SLUG[activeType] : undefined;

  const showTypes = availableTypes.length > 1;
  const showRoles = roleCounts.length > 1;
  if (!showTypes && !showRoles) return null;

  return (
    <div className="flex items-center gap-3 overflow-x-auto">
      {showTypes && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Link href={buildHref(basePath, undefined, roleSlug)} className={chipClass(!activeType)}>
            {t("filterTypeAll")}
          </Link>
          {availableTypes.map((type) => (
            <Link
              key={type}
              href={buildHref(basePath, TYPE_SLUG[type], roleSlug)}
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
          <Link href={buildHref(basePath, typeSlug, undefined)} className={chipClass(!activeRole)}>
            {t("filterCreditAll")}
          </Link>
          {roleCounts.map(({ role, count }) => (
            <Link
              key={role}
              href={buildHref(basePath, typeSlug, ROLE_SLUG[role])}
              className={chipClass(activeRole === role)}
            >
              {t(ROLE_KEY[role])} · {count}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
