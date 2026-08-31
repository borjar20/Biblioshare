import type { SavedGameRecord } from "../core/db";
import { matchesWordPrefix, normalize } from "./regular-chips";

const MAX_SUGGESTIONS = 6;

/** Juegos ya usados en la herramienta de puntuación, para los chips del setup:
 * únicos (case/acentos-insensible, gana la grafía más reciente), por recencia,
 * filtrados por la query, máx 6. PURA: se prueba sin IDB. Empate de savedAt
 * entre dos grafías: gana la primera del array (comparación estricta >) —
 * determinista, y con savedAt en epoch ms el empate real es anecdótico. */
export function gameNameSuggestions(saved: SavedGameRecord[], query: string): string[] {
  const byKey = new Map<string, { name: string; savedAt: number }>();
  for (const record of saved) {
    if (record.deletedAt !== null || record.summary.toolId !== "score") continue;
    const name = record.summary.tool.gameName;
    if (typeof name !== "string" || name === "") continue;
    const key = normalize(name);
    const existing = byKey.get(key);
    if (!existing || record.savedAt > existing.savedAt) {
      byKey.set(key, { name, savedAt: record.savedAt });
    }
  }
  return [...byKey.values()]
    .filter((entry) => matchesWordPrefix(entry.name, query))
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.name);
}
