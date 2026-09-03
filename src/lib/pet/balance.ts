// EL ÚNICO sitio con números (spec §3). Como todo se deriva, cambiar un peso
// recalcula a todo el mundo: nadie pierde nada. Calibrar contra los usuarios
// reales de prod antes de cerrar la fase (Task 10).
export const BALANCE = {
  // Por sesión: max(floor(minutos/10), floor(páginas/10)) → "unidad de sesión".
  // Se colapsa en el contador porque el máximo es por sesión, no sobre sumas.
  FUE: { perSessionUnit: 1, perEpisode: 3 },
  CON: { perActiveDay: 2, perDailyGoalDay: 5, perStreakMilestone: 20 },
  // `perFinishedPass` solo cuenta pases VIVIDOS en la app. Los del historial
  // (importados o añadidos con fecha pasada) entran como dote con tope: ver
  // `history` y splitPassHistory en counts.ts.
  INT: { perFinishedPass: 10, perCompletedSaga: 25, perDistinctGenre: 5, perHistoricalPass: 2, historicalPassCap: 50 },
  SAB: { perNote: 3, perQuote: 3, perReview: 8, perRating: 1 },
  CAR: { perPost: 3, perVote: 1, perPoll: 5, perEvent: 5, perFollow: 2 },
  DES: { perNewWork: 2, perNewAuthor: 1, perHistoricalWork: 1, historicalWorkCap: 50 },
  // Un día de alta con este número de pases o más es un volcado (importación
  // o carga manual del historial): todos sus pases cuentan como historial.
  history: { burstMin: 10 },
  // Misiones diarias (spec fase 2 §1). La XP de cada plantilla NO se lista
  // aquí: se deriva de los pesos de arriba en missions/templates.ts.
  missions: {
    targets: { session_minutes: 20, session_pages: 30, episodes: 2 },
    // finish_pass elegible: libro con posición >= 70 % de sus páginas o serie
    // con <= 2 episodios sin ver. review elegible: terminado en los últimos 7 días.
    finishThreshold: 0.7,
    seriesEpisodesLeft: 2,
    reviewWindowDays: 7,
  },
  // Avisos push (spec fase 3): racha mínima para avisar de que se acaba. Los
  // umbrales de humor son mood.sleepyFrom / sadFrom. claim_pet_nudges()
  // (20260906) lleva los tres COPIADOS: si cambian aquí, cambia el SQL.
  nudges: { streakMin: 3 },
  // Logros por familias con escalera ABIERTA (spec logros-niveles §1): los
  // primeros niveles a mano (`steps`), después último + `then` por nivel.
  // `then: null` = escalera cerrada (no hay nivel más allá de `steps`). Los
  // primeros pasos coinciden con los umbrales planos antiguos para que la
  // migración 20260904 no pierda ninguna fecha.
  achievements: {
    finished: { steps: [10, 50, 100, 200], then: 100 },
    sessions: { steps: [100, 250, 500, 1000], then: 500 },
    episodes: { steps: [100, 250, 500, 1000], then: 500 },
    notes: { steps: [50, 100, 200, 400], then: 200 },
    reviews: { steps: [10, 25, 50, 100], then: 50 },
    genres: { steps: [10, 15, 20, 30], then: 10 },
    streak: { steps: [30, 100, 200, 365], then: 365 },
    posts: { steps: [50, 100, 150, 300], then: 300 },
    sagas: { steps: [3, 5, 10, 20], then: 10 },
    missions: { steps: [50, 100, 200, 400], then: 400 },
    stage: { steps: [10, 40], then: null },
  },
  classBonus: 1.5,
  // nivel = floor(sqrt(xp / divisor)) + 1  → nivel 10 = 1 215 XP, nivel 40 = 22 815.
  // Calibrado contra prod (Task 10, 2026-09-02) y recalibrado el mismo día al
  // separar historial de vivido: con la fórmula aproximada (unidades de sesión
  // + episodios×3 + terminados vividos×10 + dote + notas×3 + posts×3 + días
  // activos×2 + obras vividas×2) el usuario más activo de prod ronda 1 300 XP
  // con bonus de clase, o sea nivel 10 (adulta) justo; los dos siguientes, con
  // casi todo su historial volcado, quedan en ~7 y ~4. Con el divisor de
  // referencia de la spec (50) nadie pasaba de nivel 6. Ver decisiones.md
  // 2026-09-02 (dos entradas).
  level: { divisor: 15 },
  stages: { adult: 10, veteran: 40 },
  mood: { neutralFrom: 1, sleepyFrom: 2, sadFrom: 4 },
} as const;
