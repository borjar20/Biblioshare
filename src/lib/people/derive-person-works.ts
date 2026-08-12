import type { ItemType } from "@/lib/catalog/types";
import { personHref } from "@/lib/catalog/item-href";
import type { CreditRole } from "./types";
import type { Collaborator, ProfileWork } from "./profile-types";

// Toda la lógica de FORMA de la ficha de persona, en funciones puras: no tocan
// Supabase y por eso se pueden probar sin base de datos.

const FEATURED_MAX = 5;
// Con 3 obras o menos no hay «destacadas»: destacar 3 de 3 no destaca nada, y la
// lista de abajo se quedaría vacía. Ver los estados de volumen del spec.
const FEATURED_MIN_WORKS = 4;
// Umbral de sección por rol: un cameo suelto no parte el centro en dos.
const SECTION_MIN_WORKS = 3;
const SECTION_MIN_SHARE = 0.2;
const COLLABORATOR_MIN_SHARED = 2;

export function deriveRoleCounts(works: ProfileWork[]): Array<{ role: CreditRole; count: number }> {
  const counts = new Map<CreditRole, number>();
  for (const w of works) {
    // Una obra con dos créditos de la misma persona cuenta en LOS DOS chips: es
    // lo que hace que "Reparto · 12 / Dirección · 4" sume más que las obras.
    for (const role of new Set(w.roles)) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
}

export type DominantType = "watched" | "read" | "mixed";

// El verbo del resumen: "Has visto" (pantalla), "Has leído" (libros) o
// "Has registrado" (empate exacto).
export function deriveDominantType(works: ProfileWork[]): DominantType {
  let screen = 0;
  let books = 0;
  for (const w of works) {
    if (w.itemType === "book") books++;
    else screen++;
  }
  if (screen === books) return "mixed";
  return screen > books ? "watched" : "read";
}

export type LibrarySummary = {
  visible: boolean;
  total: number;
  done: number;
  verb: DominantType;
};

// "Has visto 0 de 1" no informa de nada y ocupa un bloque entero: el resumen
// solo aparece con al menos 3 obras y al menos una terminada.
export function deriveLibrarySummary(works: ProfileWork[]): LibrarySummary {
  const total = works.length;
  const done = works.filter((w) => w.status === "completed").length;
  return {
    visible: total >= 3 && done >= 1,
    total,
    done,
    verb: deriveDominantType(works),
  };
}

// Criterio del spec, EN ESTE ORDEN: tu nota alta > mejor nota global > más
// reciente. El desempate final por itemId hace el orden ESTABLE: sin él, dos
// renders del mismo perfil podían bailar.
export function pickFeatured(works: ProfileWork[], max = FEATURED_MAX): ProfileWork[] {
  if (works.length < FEATURED_MIN_WORKS) return [];
  return [...works]
    .sort(
      (a, b) =>
        (b.userRating ?? 0) - (a.userRating ?? 0) ||
        (b.globalRating ?? 0) - (a.globalRating ?? 0) ||
        (b.year ?? 0) - (a.year ?? 0) ||
        a.itemId.localeCompare(b.itemId)
    )
    .slice(0, max);
}

// La exclusión ES la razón de que la lista de abajo se titule "El resto, por
// año": sin ella las cinco destacadas salían DOS veces en la misma pantalla.
export function splitFeaturedAndRest(works: ProfileWork[]): {
  featured: ProfileWork[];
  rest: ProfileWork[];
} {
  const featured = pickFeatured(works);
  const ids = new Set(featured.map((w) => `${w.itemType}:${w.itemId}`));
  return { featured, rest: works.filter((w) => !ids.has(`${w.itemType}:${w.itemId}`)) };
}

export type YearGroup = { year: number | null; works: ProfileWork[] };

export function groupByYear(works: ProfileWork[]): YearGroup[] {
  const byYear = new Map<number | null, ProfileWork[]>();
  for (const w of works) {
    const bucket = byYear.get(w.year);
    if (bucket) bucket.push(w);
    else byYear.set(w.year, [w]);
  }
  return [...byYear.entries()]
    .map(([year, list]) => ({ year, works: list }))
    // Descendente, y las obras SIN año al FINAL (no arriba: un null no es "lo
    // más reciente").
    .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
}

export type RoleSection = { role: CreditRole; works: ProfileWork[] };

// Parte el centro en "Como directora" / "Como intérprete" solo cuando el rol
// secundario pesa de verdad: >=3 obras o >=20% del total. Devuelve [] para "no
// partas nada, pinta una lista plana".
export function deriveRoleSections(works: ProfileWork[]): RoleSection[] {
  const counts = deriveRoleCounts(works);
  if (counts.length < 2) return [];

  const total = works.length;
  const qualifying = counts.filter(
    (c) => c.count >= SECTION_MIN_WORKS || c.count / total >= SECTION_MIN_SHARE
  );
  if (qualifying.length < 2) return [];

  return qualifying.map(({ role }) => ({
    role,
    works: works.filter((w) => w.roles.includes(role)),
  }));
}

export type WorkFilters = { type?: ItemType; role?: CreditRole };

export function filterWorks(works: ProfileWork[], filters: WorkFilters): ProfileWork[] {
  return works.filter(
    (w) =>
      (!filters.type || w.itemType === filters.type) &&
      (!filters.role || w.roles.includes(filters.role))
  );
}

export type CollaboratorRow = {
  personId: string;
  name: string;
  photoUrl: string | null;
  role: CreditRole;
  /** `${itemType}:${itemId}` — la clave por la que se cuentan OBRAS, no filas. */
  itemKey: string;
};

// "Colabora a menudo con": >=2 OBRAS compartidas. Se cuentan obras DISTINTAS, no
// filas de crédito — si no, alguien que actúa y dirige la misma película
// aparecería como colaborador habitual con una sola obra en común.
export function deriveCollaborators(rows: CollaboratorRow[]): Collaborator[] {
  const byPerson = new Map<
    string,
    { name: string; photoUrl: string | null; roles: Map<CreditRole, number>; items: Set<string> }
  >();

  for (const r of rows) {
    let entry = byPerson.get(r.personId);
    if (!entry) {
      entry = { name: r.name, photoUrl: r.photoUrl, roles: new Map(), items: new Set() };
      byPerson.set(r.personId, entry);
    }
    entry.items.add(r.itemKey);
    entry.roles.set(r.role, (entry.roles.get(r.role) ?? 0) + 1);
  }

  return [...byPerson.entries()]
    .filter(([, e]) => e.items.size >= COLLABORATOR_MIN_SHARED)
    .map(([id, e]) => ({
      id,
      name: e.name,
      photoUrl: e.photoUrl,
      href: personHref(id),
      // El rol con el que más veces coincide: es el que se enseña bajo el nombre.
      role: [...e.roles.entries()].sort((a, b) => b[1] - a[1])[0][0],
      sharedCount: e.items.size,
    }))
    .sort((a, b) => b.sharedCount - a.sharedCount || a.name.localeCompare(b.name));
}
