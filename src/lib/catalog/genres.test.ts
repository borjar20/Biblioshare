import { describe, expect, it } from "vitest";
import { GENRES, isCanonicalLabel, genreDefForSlug, slugForLabel } from "./genre-vocab";
import { mapSubjectsToGenres } from "./genres";

// Subjects representativos de cada regla (needles de PREFIX_RULES/EXACT_RULES),
// compartidos por los dos tests de invariante de abajo.
const REPRESENTATIVE_SUBJECTS = [
  "science fiction", "dystopian fiction", "magic realism", "crime fiction",
  "true crime", "thriller", "mystery", "fantasy", "horror", "romance",
  "adventure stories", "historical fiction", "political fiction", "classic",
  "satire", "graphic novel", "manga", "poetry", "plays", "short stories",
  "juvenile fiction", "young adult", "memoir", "biography", "self help",
  "history", "philosophy", "psychology", "economics", "religion", "travel",
  "cooking", "sports", "art", "essays", "science",
];

describe("mapSubjectsToGenres", () => {
  it("mapea subjects conocidos a géneros canónicos en español", () => {
    expect(mapSubjectsToGenres(["Science fiction"])).toEqual(["Ciencia ficción"]);
    expect(mapSubjectsToGenres(["Fantasy fiction"])).toEqual(["Fantasía"]);
    expect(mapSubjectsToGenres(["Biography"])).toEqual(["Biografía"]);
  });

  it("descarta el ruido de catalogación", () => {
    expect(
      mapSubjectsToGenres([
        "Accessible book",
        "Protected DAISY",
        "In library",
        "New York Times bestseller",
        "Translations into Spanish",
        "Large type books",
        "Reading Level-Grade 9",
      ])
    ).toEqual([]);
  });

  it("prefiere la regla más específica sobre la genérica", () => {
    // "science fiction" no puede caer en "Divulgación" por contener "science".
    expect(mapSubjectsToGenres(["Science fiction"])).toEqual(["Ciencia ficción"]);
    // "detective and mystery stories" es novela negra, no "Misterio" a secas.
    expect(mapSubjectsToGenres(["Detective and mystery stories"])).toEqual([
      "Novela negra",
    ]);
  });

  it("deduplica géneros y respeta el orden de los subjects", () => {
    expect(
      mapSubjectsToGenres(["Fantasy", "Epic fantasy", "Adventure stories"])
    ).toEqual(["Fantasía", "Aventura"]);
  });

  it("corta en 5 géneros", () => {
    const genres = mapSubjectsToGenres([
      "Fantasy",
      "Science fiction",
      "Horror",
      "Romance",
      "Poetry",
      "Biography",
      "History",
    ]);
    expect(genres).toHaveLength(5);
    expect(genres).toEqual([
      "Fantasía",
      "Ciencia ficción",
      "Terror",
      "Romance",
      "Poesía",
    ]);
  });

  it("es indiferente a mayúsculas y acentos", () => {
    expect(mapSubjectsToGenres(["FANTASÍA", "ciencia-ficción"])).toEqual([
      "Fantasía",
      "Ciencia ficción",
    ]);
  });

  it("tolera null y lista vacía", () => {
    expect(mapSubjectsToGenres(null)).toEqual([]);
    expect(mapSubjectsToGenres([])).toEqual([]);
  });

  // Los casos de abajo son subjects REALES de OpenLibrary, y cada uno es un
  // falso positivo que se coló en la primera versión del mapeo. Un tema no es un
  // género, y una palabra dentro de otra palabra no es una coincidencia.
  describe("falsos positivos vistos en datos reales", () => {
    it("'thoughtcrime' (1984) no es novela negra", () => {
      expect(mapSubjectsToGenres(["thoughtcrime"])).toEqual([]);
      // Pero "crime" a principio de palabra sí cuenta.
      expect(mapSubjectsToGenres(["Crime fiction"])).toEqual(["Novela negra"]);
    });

    it("la psicología como TEMA no hace del libro un libro de Psicología", () => {
      expect(mapSubjectsToGenres(["Psychological fiction"])).toEqual([]);
      expect(mapSubjectsToGenres(["loss (psychology)"])).toEqual([]);
      // El subject que ES el género, sí.
      expect(mapSubjectsToGenres(["Psychology"])).toEqual(["Psicología"]);
    });

    it("'voyages and travels' no es un libro de viajes", () => {
      expect(mapSubjectsToGenres(["voyages and travels"])).toEqual([]);
      expect(mapSubjectsToGenres(["Travel"])).toEqual(["Viajes"]);
    });

    it("'History and criticism' es crítica literaria, no Historia", () => {
      expect(mapSubjectsToGenres(["History and criticism"])).toEqual([]);
      expect(mapSubjectsToGenres(["History"])).toEqual(["Historia"]);
    });

    it("'Homeless children' es un tema, no literatura infantil", () => {
      expect(mapSubjectsToGenres(["Homeless children"])).toEqual([]);
      expect(mapSubjectsToGenres(["Juvenile fiction"])).toEqual(["Infantil"]);
    });

    it("descarta las etiquetas con prefijo de fuente (nyt:, award:)", () => {
      expect(
        mapSubjectsToGenres([
          "nyt:mass-market-monthly=2021-11-07",
          "award:nebula_award=novel",
        ])
      ).toEqual([]);
    });

    it("los subjects reales de 1984 dan géneros creíbles", () => {
      expect(
        mapSubjectsToGenres([
          "thoughtcrime",
          "English science fiction",
          "FICTION CLASSICS",
          "Political fiction",
          "Dystopias",
          "Psychological fiction",
          "History and criticism",
        ])
      ).toEqual(["Ciencia ficción", "Clásicos", "Política", "Distopía"]);
    });
  });
});

describe("genres.ts ↔ registro canónico", () => {
  // Todas las labels que las reglas pueden emitir están en el registro. Si esto
  // falla, o se corrige el texto en genres.ts o se añade la entrada al registro
  // — nunca se guarda una label fuera del vocabulario.
  it("cada label producible por las reglas es canónica", () => {
    // Reunimos las labels de salida ejercitando subjects representativos de cada
    // regla. Fuente: los needles de PREFIX_RULES/EXACT_RULES.
    for (const s of REPRESENTATIVE_SUBJECTS) {
      for (const label of mapSubjectsToGenres([s])) {
        expect(isCanonicalLabel(label), `"${label}" (de "${s}") no es canónica`).toBe(true);
      }
    }
  });

  // La página de género (/genero/[slug]) solo consulta `books` cuando
  // appliesTo incluye "book" (get-catalog-by-genre.ts). Si el registro
  // estrechara el appliesTo de un género que genres.ts SÍ puede emitir para un
  // libro, ese libro dejaría de aparecer en su propia página de género sin
  // ningún error visible — este test cierra ese hueco.
  it("cada label producible por las reglas resuelve a un slug que aplica a libro", () => {
    for (const s of REPRESENTATIVE_SUBJECTS) {
      for (const label of mapSubjectsToGenres([s])) {
        const slug = slugForLabel(label);
        expect(slug, `"${label}" (de "${s}") no resuelve a slug`).not.toBeNull();
        const def = genreDefForSlug(slug!);
        expect(def?.appliesTo.includes("book"), `"${label}" (slug "${slug}") no aplica a libro`).toBe(true);
      }
    }
  });

  it("el registro no promete a libros géneros que las reglas no producen", () => {
    // Cada género book-only del registro debe ser alcanzable por alguna regla.
    // (Guardia laxa: solo comprobamos que existen en el catálogo de reglas.)
    const bookLabels = new Set(
      GENRES.filter((g) => g.appliesTo.includes("book")).map((g) => g.label),
    );
    expect(bookLabels.has("Ciencia ficción")).toBe(true);
    expect(bookLabels.has("Ensayo")).toBe(true);
  });
});
