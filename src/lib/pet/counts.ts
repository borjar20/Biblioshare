// Contadores brutos que alimentan deriveAttributes. Los lee get-pet-counts.ts
// de las tablas existentes; aquí solo la forma, para que la derivación sea pura.
export interface PetCounts {
  /** Σ por sesión de max(floor(min/10), floor(páginas/10)). */
  sessionUnits: number;
  episodes: number;
  activeDays: number;
  dailyGoalDays: number;
  streakMilestones: number;
  finishedPasses: number;
  completedSagas: number;
  distinctGenres: number;
  notes: number;
  quotes: number;
  reviews: number;
  ratings: number;
  posts: number;
  votes: number;
  polls: number;
  events: number;
  follows: number;
  newWorks: number;
  newAuthors: number;
  importedRows: number;
}

export const EMPTY_COUNTS: PetCounts = {
  sessionUnits: 0,
  episodes: 0,
  activeDays: 0,
  dailyGoalDays: 0,
  streakMilestones: 0,
  finishedPasses: 0,
  completedSagas: 0,
  distinctGenres: 0,
  notes: 0,
  quotes: 0,
  reviews: 0,
  ratings: 0,
  posts: 0,
  votes: 0,
  polls: 0,
  events: 0,
  follows: 0,
  newWorks: 0,
  newAuthors: 0,
  importedRows: 0,
};
