"use client";

import { createContext, useContext, type ReactNode } from "react";

export const SeriesEpisodeContext = createContext<{
  browser: ReactNode;
  primary: ReactNode;
  sticky: ReactNode;
  feedback: ReactNode;
  progress: { percent: number; left: string; right: string } | null;
  upToDate: boolean;
} | null>(null);

export function useSeriesEpisodes() {
  return useContext(SeriesEpisodeContext);
}

export function EpisodeBrowser() {
  return useSeriesEpisodes()?.browser ?? null;
}
