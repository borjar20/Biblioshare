import type { Position } from "@/lib/library/position";

// A single logged reading/watching session (docs/REQUIREMENTS.md §7.14).
// Distinct from DiaryEntry: a diary entry records a *complete pass* (rating +
// review); a session records *incremental progress* (position reached,
// optional manual duration, optional note/quote).
export type ProgressSession = {
  id: string;
  sessionDate: string;
  durationMinutes: number | null;
  // Position REACHED in this session: {page} for books, {season, episode}
  // for series. Movies don't have sessions (see §7.14 scope decision).
  position: Position;
  note: string | null;
};
