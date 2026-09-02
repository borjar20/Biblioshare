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
  // nivel = floor(sqrt(xp / divisor)) + 1  → nivel 10 = 1 215 XP, nivel 40 = 22 815.
  // Calibrado contra prod (Task 10, 2026-09-02): con la fórmula aproximada de
  // la spec (minutos/10 + terminados×10 + notas×3 + posts×3 + días activos×2),
  // el usuario más activo de prod (9 perfiles reales) rondaba 1 600 XP. Con el
  // divisor de referencia (50, nivel 10 = 4 050 XP) se quedaba en nivel 6, muy
  // lejos de adulta; incluso el ejemplo de la spec (25 → nivel 10 = 2 025 XP)
  // se queda corto (nivel 9). 15 deja al más activo en nivel 11 (adulta) con
  // margen, y a los demás sin saltos absurdos porque el resto de fuentes de XP
  // (valoraciones, votos, rachas...) no entran en esta estimación aproximada
  // y solo pueden sumar. Ver decisiones.md 2026-09-02.
  level: { divisor: 15 },
  stages: { adult: 10, veteran: 40 },
  mood: { neutralFrom: 1, sleepyFrom: 2, sadFrom: 4 },
} as const;
