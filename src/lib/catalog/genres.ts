// Los `subject` de OpenLibrary son texto libre y sucio: junto a "Fantasy" vienen
// "Protected DAISY", "Accessible book" o "New York Times bestseller". Volcarlos
// tal cual como GenreTags (lo que se hacía antes) llenaba la ficha de basura.
//
// Aquí se traducen a un vocabulario CERRADO en español, del mismo estilo que los
// géneros que TMDB ya devuelve para películas y series. Lo que no mapea se
// descarta: es preferible un libro sin géneros a un libro etiquetado "In library".
// Ver docs/REQUIREMENTS.md §7.2.

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
// accesibilidad, préstamo, premios, nivel de lectura). Se compara por "contiene"
// sobre el subject normalizado, así que las entradas tienen que ser lo bastante
// largas para no atrapar palabras legítimas.
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
];

// ORDEN SIGNIFICATIVO: gana la primera regla cuyo needle esté contenido en el
// subject normalizado, así que lo específico va SIEMPRE antes que lo genérico
// ("science fiction" antes que "science", si no Dune acabaría en Divulgación).
const RULES: Array<[needle: string, genre: string]> = [
  // Ficción de género.
  ["science fiction", "Ciencia ficción"],
  ["ciencia ficcion", "Ciencia ficción"],
  ["dystopi", "Distopía"],
  ["distopi", "Distopía"],
  ["magic realism", "Realismo mágico"],
  ["realismo magico", "Realismo mágico"],
  ["detective and mystery", "Novela negra"],
  ["detective", "Novela negra"],
  ["noir", "Novela negra"],
  ["novela negra", "Novela negra"],
  ["true crime", "True crime"],
  ["crime", "Novela negra"],
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
  ["classic", "Clásicos"],
  ["clasico", "Clásicos"],
  ["humor", "Humor"],
  ["satire", "Humor"],
  ["graphic novel", "Cómic"],
  ["comic", "Cómic"],
  ["manga", "Manga"],
  ["poetry", "Poesía"],
  ["poesia", "Poesía"],
  ["plays", "Teatro"],
  ["teatro", "Teatro"],
  ["short stories", "Relatos"],
  ["relatos", "Relatos"],
  ["young adult", "Juvenil"],
  ["juvenil", "Juvenil"],
  ["juvenile", "Infantil"],
  ["children", "Infantil"],
  ["infantil", "Infantil"],
  ["picture books", "Infantil"],

  // No ficción.
  ["autobiograph", "Memorias"],
  ["memoir", "Memorias"],
  ["memorias", "Memorias"],
  ["biograph", "Biografía"],
  ["biografia", "Biografía"],
  ["history", "Historia"],
  ["historia", "Historia"],
  ["philosoph", "Filosofía"],
  ["filosofia", "Filosofía"],
  ["psycholog", "Psicología"],
  ["psicologia", "Psicología"],
  ["self help", "Autoayuda"],
  ["autoayuda", "Autoayuda"],
  ["economic", "Economía"],
  ["business", "Economía"],
  ["economia", "Economía"],
  ["politic", "Política"],
  ["politica", "Política"],
  ["religio", "Religión"],
  ["travel", "Viajes"],
  ["viajes", "Viajes"],
  ["cooking", "Cocina"],
  ["cookery", "Cocina"],
  ["cocina", "Cocina"],
  ["sports", "Deporte"],
  ["deporte", "Deporte"],
  ["essay", "Ensayo"],
  ["ensayo", "Ensayo"],
  ["science", "Divulgación"],
  ["ciencia", "Divulgación"],
  ["nature", "Divulgación"],
  ["technology", "Divulgación"],
];

function isNoise(normalized: string): boolean {
  return NOISE.some((needle) => normalized.includes(needle));
}

function genreFor(normalized: string): string | null {
  for (const [needle, genre] of RULES) {
    if (normalized.includes(needle)) return genre;
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
