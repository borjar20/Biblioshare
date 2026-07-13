import type { Json } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/catalog/types";

// El criterio de un reto de club y los tipos de su tablero (EPIC-05, Bloque H4).
//
// Módulo PLANO a propósito (no "use server"): en un módulo de server actions todo export
// debe ser una función asíncrona, y aquí hay tipos y un parser síncrono que los componentes
// cliente importan. Misma separación que list-challenge-types.ts en H3 (donde ese error
// llegó a romper el build).
//
// El criterio vive en club_activities.config (jsonb, opaco a SQL/RLS) -- primer consumidor
// real de ese campo, que SD-8 reservó en Bloque G. Su forma es la de Challenge (§7.10,
// src/lib/challenges/types.ts) más el modo, porque un criteria_challenge ES un reto personal
// evaluado sobre varias personas: por eso el conteo puede reutilizar countForChallenge tal
// cual, sin reimplementarse.

export type CriteriaMode = "competitive" | "cooperative";
export const CRITERIA_MODES: CriteriaMode[] = ["competitive", "cooperative"];

export type CriteriaChallengeConfig = {
  mode: CriteriaMode;
  itemType: ItemType | null; // null = cualquier tipo cuenta
  targetCount: number;
  genre?: string;
  sagaId?: string;
};

const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];

// config es jsonb sin validar en BD -- esta es la única puerta de entrada tipada. Devuelve
// null si la actividad todavía no tiene criterio o si está mal formado (p.ej. una propuesta
// guardada sin config), y el tablero muestra el estado "sin criterio" en vez de romperse.
export function parseCriteriaConfig(raw: Json | null): CriteriaChallengeConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;

  const mode: CriteriaMode = v.mode === "cooperative" ? "cooperative" : "competitive";

  const targetCount = Number(v.targetCount);
  if (!Number.isInteger(targetCount) || targetCount < 1) return null;

  const itemType = ITEM_TYPES.includes(v.itemType as ItemType) ? (v.itemType as ItemType) : null;

  const config: CriteriaChallengeConfig = { mode, itemType, targetCount };
  if (typeof v.genre === "string" && v.genre.trim()) config.genre = v.genre.trim();
  if (typeof v.sagaId === "string" && v.sagaId) config.sagaId = v.sagaId;
  return config;
}

export type CriteriaParticipantProgress = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isViewer: boolean;
  completed: number; // capado a targetCount (para la barra)
  rawCompleted: number; // conteo real (puede superar la meta)
};

export type CriteriaChallengeView = {
  config: CriteriaChallengeConfig;
  windowStart: string; // YYYY-MM-DD
  windowEnd: string;
  // Roster COMPLETO de participantes (quien va 0/N también sale), ordenado por progreso.
  participants: CriteriaParticipantProgress[];
  clubTotal: number; // Σ rawCompleted -- la cifra que manda en modo cooperativo
};
