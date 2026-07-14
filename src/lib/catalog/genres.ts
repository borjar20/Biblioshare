// Los `subject` de OpenLibrary son texto libre y sucio: junto a "Fantasy" vienen
// "Protected DAISY", "award:nebula_award=novel" o "nyt:mass-market-monthly=2021-11-07".
// Volcarlos tal cual como GenreTags (lo que se hacía antes) llenaba la ficha de
// basura.
//
// Aquí se traducen a un vocabulario CERRADO en español, del mismo estilo que los
// géneros que TMDB ya devuelve para películas y series. Lo que no mapea se
// descarta: es preferible un libro sin géneros a un libro etiquetado "In library".
// Ver docs/REQUIREMENTS.md §7.2.
//
// Dos niveles de coincidencia, y la razón de cada uno está sacada de subjects
// REALES (ver el checklist manual):
//
//  1. PREFIJO DE PALABRA para los géneros de ficción. Un subject de ficción casi
//     nunca viene solo ("American fantasy fiction", "Fiction, science fiction,
//     general"), así que hay que buscar dentro de la cadena — pero SOLO a
//     principio de palabra: con `includes` a secas, el subject "thoughtcrime" de
//     1984 casaba con "crime" y el libro salía etiquetado como novela negra.
//
//  2. COINCIDENCIA EXACTA para los géneros de no ficción. Son los que se
//     contaminan con temas: "loss (psychology)" y "Psychological fiction" no
//     hacen de El nombre del viento un libro de Psicología, ni "voyages and
//     travels" un libro de Viajes, ni "History and criticism" (crítica
//     literaria) un libro de Historia. Como género solo cuentan si el subject
//     ES el género.

const MAX_GENRES = 5;

// Minúsculas, sin diacríticos y con los separadores unificados a espacio, para
// que "Ciencia-Ficción" y "science fiction" pasen por el mismo camino.
function normalize(subject: string): string {
  return subject
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[-_/,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Ruido de catalogación: no describe el libro, describe el registro (formato de
// accesibilidad, préstamo, premios, listas de ventas, nivel de lectura).
const NOISE = [
  "accessible book",
  "protected daisy",
  "in library",
  "internet archive",
  "overdrive",
  "large type books",
  "large print",
  "bestseller",
  "reading level",
  "lending library",
  "staff picks",
  "translations into",
  "translated into",
  "award",
  "nyt:",
];

// Nivel 1 — ficción. ORDEN SIGNIFICATIVO: gana la primera regla que case, así que
// lo específico va SIEMPRE antes que lo genérico ("science fiction" antes que
// "science", si no Dune acabaría en Divulgación).
const PREFIX_RULES: Array<[needle: string, genre: string]> = [
  ["science fiction", "Ciencia ficción"],
  ["ciencia ficcion", "Ciencia ficción"],
  ["dystopi", "Distopía"],
  ["distopi", "Distopía"],
  ["magic realism", "Realismo mágico"],
  ["realismo magico", "Realismo mágico"],
  ["detective", "Novela negra"],
  ["true crime", "True crime"],
  ["crime", "Novela negra"],
  ["noir", "Novela negra"],
  ["novela negra", "Novela negra"],
  ["thriller", "Thriller"],
  ["suspense", "Thriller"],
  ["mystery", "Misterio"],
  ["misterio", "Misterio"],
  ["fantasy", "Fantasía"],
  ["fantasia", "Fantasía"],
  ["ghost stories", "Terror"],
  ["horror", "Terror"],
  ["terror", "Terror"],
  ["romance", "Romance"],
  ["love stories", "Romance"],
  ["adventure", "Aventura"],
  ["aventura", "Aventura"],
  ["historical fiction", "Histórica"],
  ["novela historica", "Histórica"],
  ["war stories", "Histórica"],
  ["political fiction", "Política"],
  ["novela politica", "Política"],
  ["classic", "Clásicos"],
  ["clasico", "Clásicos"],
  ["satire", "Humor"],
  ["humor", "Humor"],
  ["graphic novel", "Cómic"],
  ["comic", "Cómic"],
  ["manga", "Manga"],
  ["poetry", "Poesía"],
  ["poesia", "Poesía"],
  ["plays", "Teatro"],
  ["teatro", "Teatro"],
  ["short stories", "Relatos"],
  ["relatos", "Relatos"],
  // Infantil ANTES que Juvenil: el prefijo español "juvenil" casaría con el
  // inglés "juvenile fiction", que es infantil, no juvenil.
  // Ojo también: "juvenile" y "children" a secas NO valen — "Juvenile audience"
  // es una categoría de biblioteca y "Homeless children" es un tema.
  ["juvenile fiction", "Infantil"],
  ["juvenile literature", "Infantil"],
  ["children's stories", "Infantil"],
  ["children's fiction", "Infantil"],
  ["picture books", "Infantil"],
  ["literatura infantil", "Infantil"],
  ["young adult", "Juvenil"],
  ["juvenil", "Juvenil"],
  ["autobiograph", "Memorias"],
  ["memoir", "Memorias"],
  ["memorias", "Memorias"],
  ["biograph", "Biografía"],
  ["biografia", "Biografía"],
  ["self help", "Autoayuda"],
  ["autoayuda", "Autoayuda"],
];

// Nivel 2 — no ficción. El subject tiene que SER el género, ni más ni menos.
const EXACT_RULES: Record<string, string> = {
  history: "Historia",
  historia: "Historia",
  philosophy: "Filosofía",
  filosofia: "Filosofía",
  psychology: "Psicología",
  psicologia: "Psicología",
  politics: "Política",
  "political science": "Política",
  politica: "Política",
  economics: "Economía",
  economia: "Economía",
  business: "Economía",
  religion: "Religión",
  travel: "Viajes",
  viajes: "Viajes",
  cooking: "Cocina",
  cookery: "Cocina",
  cocina: "Cocina",
  sports: "Deporte",
  deporte: "Deporte",
  art: "Arte",
  arte: "Arte",
  essays: "Ensayo",
  ensayo: "Ensayo",
  science: "Divulgación",
  ciencia: "Divulgación",
  nature: "Divulgación",
  technology: "Divulgación",
};

function isNoise(normalized: string): boolean {
  return NOISE.some((needle) => normalized.includes(needle));
}

// Coincide a principio de palabra: "crime" casa con "crime fiction" y "crimes",
// pero NO con "thoughtcrime". Nada de \b al final, para que un prefijo como
// "dystopi" siga cubriendo "dystopias", "dystopian" y "dystopies".
function startsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}`, "u").test(haystack);
}

function genreFor(normalized: string): string | null {
  const exact = EXACT_RULES[normalized];
  if (exact) return exact;

  for (const [needle, genre] of PREFIX_RULES) {
    if (startsWord(normalized, needle)) return genre;
  }
  return null;
}

export function mapSubjectsToGenres(
  subjects: string[] | null | undefined
): string[] {
  if (!subjects || subjects.length === 0) return [];

  const genres: string[] = [];

  for (const subject of subjects) {
    if (typeof subject !== "string") continue;

    const normalized = normalize(subject);
    if (!normalized || isNoise(normalized)) continue;

    const genre = genreFor(normalized);
    if (!genre || genres.includes(genre)) continue;

    genres.push(genre);
    if (genres.length === MAX_GENRES) break;
  }

  return genres;
}
