import type { StatsInput } from "../specs";

/**
 * Entrada completa y NO vacía para los tests del muro.
 *
 * Cada campo trae el mínimo que hace que su panel tenga algo que decir. Sin
 * eso, media docena de secciones caen en estado vacío, `buildStatsSections` las
 * descarta, y los invariantes de sección no se llegan a evaluar: el test pasaría
 * sin haber mirado nada.
 *
 * `Partial` en el argumento para que cada test tumbe SOLO el campo que le
 * interesa (`statsInput({ formats: … })`) sin repetir los otros veintitrés.
 *
 * `todayISO` va fijo a propósito: `new Date()` aquí rompería la pureza y haría
 * que la suite fallara según el día de la semana en que se ejecute.
 */
export function statsInput(over: Partial<StatsInput> = {}): StatsInput {
  return {
    period: "all",
    itemFilter: "all",
    metric: "works",
    todayISO: "2026-08-21",
    titles: {
      completedByYear: "Completadas por año",
      rating: "Valoraciones",
      topRated: "Mejor valoradas",
      type: "Por tipo",
      status: "Estados",
      hours: "Horas por mes",
      genres: "Géneros",
      authors: "Autores",
      decades: "Décadas",
      habits: "Hábitos",
      records: "Récords",
      tbr: "La pila",
    },
    activity: {
      granularity: "month",
      buckets: [
        { key: "2026-01", works: 4, minutes: 320, book: 3, movie: 1, series: 0 },
        { key: "2026-02", works: 6, minutes: 410, book: 4, movie: 1, series: 1 },
        { key: "2026-03", works: 3, minutes: 180, book: 2, movie: 0, series: 1 },
        { key: "2026-04", works: 5, minutes: 275, book: 3, movie: 2, series: 0 },
      ],
      works: 18,
      minutes: 1185,
      byType: { book: 12, movie: 4, series: 2 },
      previousWorks: 14,
      previousMinutes: 990,
    },
    byYear: [
      { year: 2024, book: 9, movie: 4, series: 1, total: 14 },
      { year: 2025, book: 14, movie: 6, series: 2, total: 22 },
      { year: 2026, book: 12, movie: 4, series: 2, total: 18 },
    ],
    rating: {
      average: 3.9,
      count: 24,
      buckets: [
        { star: 2, count: 2 },
        { star: 3, count: 6 },
        { star: 4, count: 11 },
        { star: 5, count: 5 },
      ],
    },
    topRated: [
      { title: "Las ciudades invisibles", type: "book", rating: 5 },
      { title: "Rayuela", type: "book", rating: 4.5 },
      { title: "La carretera", type: "book", rating: 4.5 },
    ],
    type: { book: 12, movie: 4, series: 2, total: 18 },
    status: {
      buckets: [
        { status: "completed", count: 18 },
        { status: "planned", count: 9 },
        { status: "in_progress", count: 2 },
        { status: "dropped", count: 3 },
      ],
      total: 32,
    },
    hours: {
      year: 2026,
      months: [
        { month: 1, minutes: 320 },
        { month: 2, minutes: 410 },
        { month: 3, minutes: 180 },
        { month: 4, minutes: 275 },
      ],
    },
    catalog: {
      genres: [
        { name: "Fantasía", count: 6 },
        { name: "Ensayo", count: 4 },
        { name: "Novela negra", count: 3 },
      ],
      authors: [
        { name: "Ursula K. Le Guin", works: 4 },
        { name: "Italo Calvino", works: 3 },
      ],
      directors: [{ name: "Céline Sciamma", works: 2 }],
      publishers: [{ name: "Minotauro", works: 5 }],
      decades: [
        { decade: 1970, count: 3 },
        { decade: 1990, count: 5 },
        { decade: 2010, count: 7 },
      ],
      authorFacet: { top: [{ name: "Ursula K. Le Guin", works: 4 }], discovered: 2, total: 9 },
      directorFacet: { top: [{ name: "Céline Sciamma", works: 2 }], discovered: 1, total: 3 },
      newAuthors: 2,
      totalAuthors: 9,
    },
    habits: {
      favoriteBand: { startHour: 22 },
      favoriteWeekday: 6,
      averageMinutes: 42,
      sessions: 96,
      activeDays: 61,
    },
    records: {
      mostActiveMonth: { month: "2026-02", count: 6 },
      fastestBook: { title: "La carretera", days: 2 },
      rereads: 3,
    },
    streaks: { current: 5, best: 27, activeDays: 211 },
    tbr: {
      pending: 9,
      byType: { book: 6, movie: 2, series: 1 },
      oldest: { title: "En busca del tiempo perdido", type: "book", monthsWaiting: 14 },
    },
    health: {
      completionRate: 86,
      dropRate: 14,
      medianWaitMonths: 4,
      added: 12,
      finished: 18,
      addedByType: { book: 8, movie: 3, series: 1 },
      finishedByType: { book: 12, movie: 4, series: 2 },
      backlog: [
        { month: "2026-01", pending: 7 },
        { month: "2026-02", pending: 8 },
        { month: "2026-03", pending: 9 },
        { month: "2026-04", pending: 9 },
      ],
    },
    facets: {
      genres: [
        { name: "Fantasía", average: 4.4, works: 6 },
        { name: "Ensayo", average: 3.6, works: 4 },
      ],
      authors: [
        { name: "Ursula K. Le Guin", average: 4.7, works: 4 },
        { name: "Italo Calvino", average: 4.5, works: 3 },
      ],
      directors: [{ name: "Céline Sciamma", average: 4.2, works: 2 }],
      lengthVsRating: [
        { type: "book", title: "Rayuela", length: 736, star: 4.5 },
        { type: "book", title: "La carretera", length: 224, star: 4.5 },
      ],
    },
    formats: {
      books: {
        finished: 12,
        pagesRead: 4180,
        unknown: 1,
        averagePages: 348,
        longest: { title: "Rayuela", value: 736 },
        shortest: { title: "La carretera", value: 224 },
        pendingPages: 2140,
      },
      movies: {
        finished: 4,
        minutesWatched: 452,
        unknown: 0,
        averageMinutes: 113,
        longest: { title: "Retrato de una mujer en llamas", value: 122 },
        shortest: { title: "Petite maman", value: 72 },
        pendingMinutes: 240,
      },
      series: {
        episodes: 24,
        seasonsCompleted: 2,
        marathonDays: 3,
        averageGapDays: 4,
        dropped: 1,
        active: 1,
        remainingEpisodes: 14,
        remainingMinutes: 630,
      },
    },
    calendar: {
      year: 2026,
      days: [
        { date: "2026-01-01", count: 1 },
        { date: "2026-01-02", count: 0 },
        { date: "2026-02-14", count: 3 },
        { date: "2026-03-09", count: 2 },
      ],
      activeDays: 211,
      busiest: { date: "2026-02-14", count: 3 },
    },
    pagesPerDay: 37,
    rereads: {
      works: [
        {
          type: "book",
          itemId: "r1",
          title: "La mano izquierda de la oscuridad",
          first: 3.5,
          latest: 5,
          change: 1.5,
          passes: 2,
        },
        {
          type: "book",
          itemId: "r2",
          title: "Las ciudades invisibles",
          first: 4.5,
          latest: 4,
          change: -0.5,
          passes: 3,
        },
      ],
      averageChange: 0.5,
      unratedRereads: 1,
      totalRereadWorks: 3,
    },
    ...over,
  };
}
