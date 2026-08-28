// La POLÍTICA de representación de una obra, en puro (sin red ni base): qué
// idioma es preferible, cuándo merece la pena volver a mirar si se puede
// mejorar, y cómo se elige un campo entre varias candidatas.
//
// Regla de la spec 2026-08-26 §2: español → inglés → cualquier otro. El idioma
// y la procedencia de cada campo viajan en `books.repr_meta`, y son lo que le
// permite a una visita posterior MEJORAR un título inglés sin pisar jamás una
// curación manual.
//
// Este módulo no escribe nada: la regla de escritura vive en la RPC
// `hydrate_book` (fill-or-upgrade). Aquí solo se decide qué se le PROPONE.
import { isSameTitle } from "./title-match";

export type ReprLang = "es" | "en" | "other";
export type ReprSource = "openlibrary" | "google_books" | "wikidata" | "manual";

/** Una entrada de `books.repr_meta`. Los campos son opcionales a propósito:
 *  llega de la base como jsonb y puede venir de una versión anterior. */
export type ReprEntry = { lang?: string; source?: string };

export type ReprMeta = Partial<Record<"title" | "cover" | "synopsis" | "pages", ReprEntry>>;

/** Lo que se le manda a `hydrate_book` en `p_fields`. Mismo vocabulario que la
 *  RPC: valor, idioma y procedencia por campo. */
export type HydrateFields = Partial<
  Record<"title" | "cover" | "synopsis", { value: string; lang: ReprLang; source: ReprSource }>
>;

export const REVIEW_COOLDOWN_DAYS = 30;

// `pages` no entra: no tiene dimensión de idioma (la RPC lo trata como
// fill-only), así que su ausencia no es un hueco que reabrir cada 30 días.
const REVIEWED_FIELDS = ["title", "cover", "synopsis"] as const;

// GEMELO EXACTO de `public.repr_lang_rank(text)` en la base — si una de las dos
// cambia, la otra también. Aquí decide si vale la pena volver a llamar a las
// APIs; allí decide si la escritura se acepta. Que discrepen significa pedir
// datos que la RPC va a rechazar (o, peor, no pedir los que sí aceptaría).
export function langRank(lang: string | null | undefined): number {
  switch (lang) {
    case "es":
      return 0;
    case "en":
      return 1;
    case "other":
      return 2;
    default:
      return 3;
  }
}

// `repr_meta` es jsonb: puede ser un escalar, un array o traer entradas que no
// son objetos (ha pasado, ver el comentario M8 de la RPC). Se lee defensivo y
// lo que no sea una entrada bien formada se trata como ausente.
function readEntry(meta: ReprMeta | null, field: (typeof REVIEWED_FIELDS)[number]): ReprEntry | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const entry = (meta as Record<string, unknown>)[field];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  return entry as ReprEntry;
}

// ¿Merece la pena gastar llamadas externas en esta obra?
//
// Nunca hidratada → siempre. Ya hidratada → solo si queda algo mejorable
// (un campo sin entrada, con un idioma peor que el español, o sin el QID que
// ancla su identidad) Y ha pasado el cooldown. Sin el cooldown, una obra que
// solo existe en inglés volvería a pedirle lo mismo a OpenLibrary, Inventaire y
// Google Books en CADA visita a su ficha, para siempre y sin cambiar nada.
export function needsRepresentationReview(
  hydratedAt: string | null,
  meta: ReprMeta | null,
  wikidataId: string | null,
): boolean {
  if (hydratedAt === null) return true;

  // El QID es un HUECO más, y hay que mirarlo aparte porque NO vive en
  // `repr_meta`: vive en su propia columna, así que el barrido de campos de
  // abajo no lo ve. Hasta ahora un libro sin QID se reintentaba de casualidad
  // —la sinopsis, etiquetada `en` por `synopsisLang`, siempre quedaba
  // mejorable—; en cuanto Google Books empiece a llenar sinopsis españolas
  // (#886) esa casualidad desaparece y un libro todo-ES sin QID no se
  // reconsideraría JAMÁS. Y «sin QID» no es raro: Inventaire expiró en 2 de 4
  // ejecuciones reales. Se mira `!wikidataId` para tratar la cadena vacía como
  // ausente.
  const improvable =
    !wikidataId ||
    REVIEWED_FIELDS.some((field) => {
      const entry = readEntry(meta, field);
      if (!entry) return true;
      // La curación manual es intocable para la RPC: mirar si "se puede mejorar"
      // sería gastar llamadas en una escritura que se va a rechazar seguro.
      if (entry.source === "manual") return false;
      return langRank(entry.lang) > 0;
    });
  if (!improvable) return false;

  const at = Date.parse(hydratedAt);
  // Fecha ilegible: se reconsidera. Lo contrario (darla por reciente) congela la
  // obra para siempre; reconsiderar solo cuesta una evaluación, y la RPC es
  // fill-or-upgrade, así que no puede destruir nada.
  if (Number.isNaN(at)) return true;

  return Date.now() - at > REVIEW_COOLDOWN_DAYS * 864e5;
}

export type FieldOption = {
  value: string | null | undefined;
  lang: ReprLang;
  source: ReprSource;
};

// Gana la PRIMERA opción con valor: la lista se escribe en orden de política
// (es → en → other), así que "la primera que exista" ya es "la mejor según la
// política". Si ninguna tiene valor, el campo no se propone — un hueco es mejor
// que un dato inventado.
export function pickField(
  fields: HydrateFields,
  key: keyof HydrateFields,
  options: FieldOption[],
): void {
  for (const option of options) {
    const value = typeof option.value === "string" ? option.value.trim() : "";
    if (!value) continue;
    fields[key] = { value, lang: option.lang, source: option.source };
    return;
  }
}

// Un código de idioma tal y como lo declara una API externa (Google Books
// devuelve BCP-47: «es», «en», «en-GB», «es-419») traducido al vocabulario de
// la política. Solo cuenta el subtag primario; lo que no sea español ni inglés
// es «other», y un código ausente o vacío también (falla al rango peor, que es
// el que NO pisa nada).
export function toReprLang(code: string | null | undefined): ReprLang {
  const primary = (code ?? "").trim().toLowerCase().split(/[-_]/)[0];
  if (primary === "es") return "es";
  if (primary === "en") return "en";
  return "other";
}

// Heurística mínima y deliberada (spec §4): OpenLibrary casi nunca trae sinopsis
// en español, así que se etiqueta como inglesa. NO se intenta detectar el idioma
// por el contenido: un falso "es" bloquearía para siempre el upgrade desde
// Google Books, que es justo de donde va a llegar la sinopsis española.
export function synopsisLang(text: string | null | undefined): ReprLang {
  return text ? "en" : "other";
}

// Un nombre de autoría puede venir con más gente detrás de una coma
// («Brandon Sanderson, Rafael Marín» — autor y traductor), así que se compara
// nombre a nombre.
function splitNames(value: string): string[] {
  return value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

// La comparación de nombres es `isSameTitle`, la MISMA que usan
// wikidata-collapse.ts y googlebooks/client.ts, y por las mismas dos razones:
//  1. Su contención tiene COTA (65%): «Ana» ya no casa con «Susana Fortes» solo
//     por ser substring. Un helper a medida con contención bidireccional sin
//     cota es exactamente el bug que este plan ya arrastró dos veces.
//  2. Un nombre que normaliza a vacío («—», «...») no casa con NADA, en vez de
//     desactivar la verificación entera.
// Sin autor conocido en alguno de los dos lados, falla CERRADO: false.
export function authorMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = splitNames(a);
  const right = splitNames(b);
  return left.some((x) => right.some((y) => isSameTitle(x, y)));
}
