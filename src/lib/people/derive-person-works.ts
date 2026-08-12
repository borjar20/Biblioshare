import type { ItemType } from "@/lib/catalog/types";
import { personHref } from "@/lib/catalog/item-href";
import type { CreditRole } from "./types";
import { workRoleWeight } from "./credit-noise";
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

// El tipo de obra con el que teñir lo que necesita un acento (el histograma de
// notas). `deriveDominantType` responde a "¿visto o leído?"; esto responde a
// "¿de qué color?", que no es lo mismo: una persona con 3 series y 2 películas
// es "watched" en la primera y `series` en esta.
export function dominantItemType(works: ProfileWork[]): ItemType {
  const counts = new Map<ItemType, number>();
  for (const w of works) counts.set(w.itemType, (counts.get(w.itemType) ?? 0) + 1);
  let best: ItemType = "movie";
  let bestCount = -1;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Las notas del VISITANTE sobre las obras de esta persona, en los diez cubos de
 * MEDIA estrella que espera `RatingHistogram` (ascendente: 0,5★ … 5★).
 *
 * Diez cubos y no cinco, por el mismo motivo que `get-rating-distribution.ts`:
 * la nota interna es 1–10 y agrupar de dos en dos mete cada nota impar en la
 * estrella siguiente, con lo que la barra más alta y la media de la misma
 * tarjeta acaban discrepando en medio punto.
 */
export function deriveRatingBuckets(works: ProfileWork[]): number[] {
  const buckets = new Array<number>(10).fill(0);
  for (const w of works) {
    if (w.userRating == null) continue;
    // rating 1..10 -> índice 0..9
    const index = Math.min(9, Math.max(0, Math.round(w.userRating) - 1));
    buckets[index] += 1;
  }
  return buckets;
}

export type LibrarySummary = {
  visible: boolean;
  total: number;
  done: number;
  /** 0–100, entero. Lo que se ENSEÑA; `done`/`total` siguen para el progreso. */
  percent: number;
  verb: DominantType;
};

/**
 * El porcentaje que se pinta, con los dos redondeos que importan:
 *
 * - **Nunca 0% con algo terminado.** Una de 300 da 0,33% y redondearía a 0,
 *   contradiciendo al propio bloque, que solo aparece si hay al menos una.
 * - **Nunca 100% sin haberlas terminado TODAS.** 299 de 300 da 99,67%: decir
 *   100% y dejar una pendiente es la clase de mentira que hace desconfiar de
 *   todo lo demás de la pantalla.
 */
export function libraryPercent(done: number, total: number): number {
  if (total <= 0 || done <= 0) return 0;
  if (done >= total) return 100;
  const raw = (done / total) * 100;
  return Math.min(99, Math.max(1, Math.round(raw)));
}

// "Has visto 0 de 1" no informa de nada y ocupa un bloque entero: el resumen
// solo aparece con al menos 3 obras y al menos una terminada.
export function deriveLibrarySummary(works: ProfileWork[]): LibrarySummary {
  const total = works.length;
  const done = works.filter((w) => w.status === "completed").length;
  return {
    visible: total >= 3 && done >= 1,
    total,
    done,
    percent: libraryPercent(done, total),
    verb: deriveDominantType(works),
  };
}

/**
 * Criterio, EN ESTE ORDEN: peso del rol > tu nota alta > mejor nota global >
 * más reciente. El desempate final por itemId hace el orden ESTABLE: sin él,
 * dos renders del mismo perfil podían bailar.
 *
 * El PESO DEL ROL va primero, y es un añadido del 2026-08-12 a petición del
 * dueño. Sin él, en un catálogo recién hidratado las dos notas son null para
 * todo y el desempate real era el AÑO — así que en la ficha de Phil Lord los
 * making-of de 2023 salían destacados por delante de su obra como director.
 * Con el peso, la autoría (dirección, guion, creación, autoría) manda sobre el
 * reparto, y una aparición como sí mismo no destaca jamás.
 *
 * Consecuencia asumida: en una persona que dirige Y actúa mucho, las destacadas
 * tiran hacia lo que dirige. Su obra como intérprete no se pierde — está en su
 * sección de rol y en la lista por año, y el chip de crédito la filtra.
 */
export function pickFeatured(works: ProfileWork[], max = FEATURED_MAX): ProfileWork[] {
  if (works.length < FEATURED_MIN_WORKS) return [];
  return [...works]
    .sort(
      (a, b) =>
        workRoleWeight(b.roles, b.character) - workRoleWeight(a.roles, a.character) ||
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
