import type { WrapUpInputs } from "../types";

export function emptyInputs(over: Partial<WrapUpInputs> = {}): WrapUpInputs {
  return {
    time: { minutes: { book: 0, movie: 0, series: 0 }, episodesWithoutRuntime: 0, previousMinutes: null },
    activeDays: [], finished: [], inProgress: [], bestStreak: 0,
    favoriteWeekday: null, favoriteBandStartHour: null, genres: [],
    bestRated: null, phrase: null, experience: null,
    together: { jointViewings: 0, clubDays: 0 }, experienceDays: 0,
    annual: null, pet: null, ...over,
  };
}
