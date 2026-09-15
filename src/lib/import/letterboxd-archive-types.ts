export type ArchivePass = {
  sourceKey: string;
  finishedOn: string | null;
  rating: number | null;
  review: string | null;
};
export type ArchiveMovie = {
  sourceKey: string;
  title: string;
  year: number | null;
  passes: ArchivePass[];
  planned: boolean;
  reviewConflicts?: ArchiveConflict[];
};
export type ArchiveConflict = { movieKey: string; sourceKey: string; reason: "reviewAssociation"; review: string; finishedOn: string | null; rating: number | null };
export type ArchiveAnalysis = {
  fingerprint: string;
  movies: ArchiveMovie[];
  excludedFiles: string[];
  conflicts: ArchiveConflict[];
  summary: { movies: number; passes: number; unknownDates: number; planned: number; reviews: number; ratings: number; conflicts: number };
};
