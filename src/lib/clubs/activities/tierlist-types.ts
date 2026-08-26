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

// Un nivel: su etiqueta y su color.
//
// OJO con la etiqueta: es la CLAVE. Las colocaciones (club_activity_tierlist)
// guardan el tier como texto, así que renombrar un nivel de una tierlist con
// ítems ya colocados los deja huérfanos. El color, en cambio, es puro adorno y
// se puede cambiar sin consecuencias.
export type TierSpec = {
  label: string;
  /** Color del nivel. null = sin color, se pinta con el token neutro. */
  color: string | null;
};

// Paleta de niveles: de "lo mejor" a "lo peor", reutilizando los tokens que ya
// existen en vez de inventar una paleta nueva.
export const DEFAULT_TIERS: TierSpec[] = [
  { label: "S", color: "var(--status-dropped)" },
  { label: "A", color: "var(--gold)" },
  { label: "B", color: "var(--status-completed)" },
  { label: "C", color: "var(--type-movie)" },
  { label: "D", color: "var(--muted-foreground)" },
];

export const TIER_COLORS: string[] = [
  "var(--status-dropped)",
  "var(--gold)",
  "var(--status-completed)",
  "var(--type-movie)",
  "var(--type-series)",
  "var(--muted-foreground)",
];

// A partir de cuántos caracteres la etiqueta deja de caber en la columna
// estrecha (44px, serif a 20px). Medido sobre el peor caso: tres glifos anchos
// ("PEC") llenan la caja justo, el cuarto ya se sale.
const MAX_NARROW_LABEL = 3;

/** Ancho de la columna de color: 44px para S/A/B, 84px para niveles con nombre. */
export type TierColumn = "narrow" | "wide";

// Decide el ancho de la columna para TODAS las filas del tablero a la vez: si
// alguna etiqueta no cabe en los 44px, todas pasan a 84px con el rótulo
// pequeño y envuelto.
//
// Es del tablero y no de cada fila por una razón de dibujo, no de gusto: las
// portadas de todas las filas tienen que empezar en la misma vertical. Con el
// ancho por fila, cada tier arrancaría en un sitio distinto y la retícula
// dejaría de leerse como una tabla.
//
// Vive aquí y no en tier-row.tsx para poder probarla sin montar el componente
// (ni arrastrar dnd-kit al entorno `node` de vitest).
export function tierColumnWidth(labels: string[]): TierColumn {
  return labels.some((label) => label.length > MAX_NARROW_LABEL) ? "wide" : "narrow";
}

export type TierlistConfig = {
  tiers: TierSpec[];
};

// config es jsonb sin validar en BD -- esta es la única puerta de entrada
// tipada. Devuelve null si no hay tiers utilizables, y el tablero muestra "sin
// configurar" en vez de romperse.
//
// Acepta DOS formatos, y eso no es por gusto: las tierlists creadas antes de que
// los niveles tuvieran color guardaron `tiers: ["S","A",...]` en su config. Si
// dejáramos de entenderlo, esas tierlists dejarían de renderizar y sus
// colocaciones quedarían inaccesibles.
export function parseTierlistConfig(raw: Json | null): TierlistConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).tiers;
  if (!Array.isArray(value)) return null;

  const tiers: TierSpec[] = [];
  for (const entry of value) {
    // Formato antiguo: un string suelto.
    if (typeof entry === "string") {
      const label = entry.trim();
      if (label) tiers.push({ label, color: null });
      continue;
    }
    // Formato actual: { label, color }.
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      const label =
        typeof record.label === "string" ? record.label.trim() : "";
      const color = typeof record.color === "string" ? record.color : null;
      if (label) tiers.push({ label, color });
    }
  }

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
  tiers: TierSpec[];
  boards: ParticipantBoard[]; // roster COMPLETO, viewer primero
};
