import type { Json } from "@/lib/supabase/database.types";

// Tipos y parser de la tierlist de club (EPIC-05, Bloque H2).
//
// Módulo PLANO a propósito (no "use server"): en un módulo de server actions todo export debe
// ser una función asíncrona, y aquí hay tipos y un parser síncrono que los componentes cliente
// importan. Misma separación que list-challenge-types.ts (H3) y criteria-challenge-types.ts
// (H4) -- en H3 ese error llegó a romper el build.
//
// Los tiers viven en club_activities.config (jsonb, opaco a SQL/RLS): segundo consumidor de
// ese campo tras el criterio de H4.

export const DEFAULT_TIERS = ["S", "A", "B", "C", "D"];

export type TierlistConfig = {
  tiers: string[];
};

// config es jsonb sin validar en BD -- esta es la única puerta de entrada tipada. Devuelve
// null si no hay tiers utilizables, y el tablero muestra "sin configurar" en vez de romperse.
export function parseTierlistConfig(raw: Json | null): TierlistConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).tiers;
  if (!Array.isArray(value)) return null;

  const tiers = value
    .filter((tier): tier is string => typeof tier === "string")
    .map((tier) => tier.trim())
    .filter(Boolean);

  return tiers.length > 0 ? { tiers } : null;
}

export type ParticipantBoard = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isViewer: boolean;
  // itemKeys (`${itemType}:${itemId}`) por tier, ya ordenados por `position`.
  itemKeysByTier: Record<string, string[]>;
  // Ítems del pool que esta persona todavía no ha colocado (la "bandeja").
  unplacedItemKeys: string[];
};

export type TierlistView = {
  tiers: string[];
  boards: ParticipantBoard[]; // roster COMPLETO, viewer primero
};
