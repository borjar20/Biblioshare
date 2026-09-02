// EL ÚNICO sitio con números (spec §3). Como todo se deriva, cambiar un peso
// recalcula a todo el mundo: nadie pierde nada. Calibrar contra los usuarios
// reales de prod antes de cerrar la fase (Task 10).
export const BALANCE = {
  // Por sesión: max(floor(minutos/10), floor(páginas/10)) → "unidad de sesión".
  // Se colapsa en el contador porque el máximo es por sesión, no sobre sumas.
  FUE: { perSessionUnit: 1, perEpisode: 3 },
  CON: { perActiveDay: 2, perDailyGoalDay: 5, perStreakMilestone: 20 },
  INT: { perFinishedPass: 10, perCompletedSaga: 25, perDistinctGenre: 5 },
  SAB: { perNote: 3, perQuote: 3, perReview: 8, perRating: 1 },
  CAR: { perPost: 3, perVote: 1, perPoll: 5, perEvent: 5, perFollow: 2 },
  DES: { perNewWork: 2, perNewAuthor: 1, perImportedRow: 1, importedRowCap: 50 },
  classBonus: 1.5,
  // nivel = floor(sqrt(xp / divisor)) + 1  → nivel 10 = 4 050 XP, nivel 40 = 76 050.
  level: { divisor: 50 },
  stages: { adult: 10, veteran: 40 },
  mood: { neutralFrom: 1, sleepyFrom: 2, sadFrom: 4 },
} as const;
