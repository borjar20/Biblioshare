// Posts `wrap_up` (crónica publicada, spec 2026-10-06 §5 «Tarjeta del feed»).
// El post ancla en su fila de `wrap_up_shares` (anchor_id = source_id = id del
// share), que guarda el ShareSummary congelado al publicar: lo ÚNICO del wrap-up
// que sale del dueño. Lo lee el cliente de la PETICIÓN: la RLS
// `can_view_profile(user_id)` decide; si la fila no vuelve, el post se descarta
// (nunca media tarjeta). Sin `use cache` (regla #437): el resultado depende de
// quién mira.
//
// El jsonb lo escribe el servidor (publish_wrap_up), pero aquí se trata como no
// confiable: lo que el núcleo de la tarjeta necesita (periodo, cifras, narradora,
// paleta) inválido ⇒ se descarta el post; lo accesorio (portadas, ardilla) se
// degrada (portada ilegible fuera, URL no http(s) ⇒ carta con título, ardilla
// ilegible ⇒ sin ardilla).
import type { createClient } from "@/lib/supabase/server";
import { isPetClass } from "@/lib/pet/classes";
import type { PetStage } from "@/lib/pet/classes";
import { NARRATOR_STATES } from "@/lib/wrap-ups/narrator";
import type { ItemRef, OwnPet, Palette, ShareSummary } from "@/lib/wrap-ups/types";
import { isWrapUpKind } from "@/lib/wrap-ups/windows";

type Client = Awaited<ReturnType<typeof createClient>>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PALETTES: readonly Palette[] = ["book", "movie", "series", "mixed"];
const ITEM_TYPES: readonly ItemRef["type"][] = ["book", "movie", "series"];
const PET_STAGES: readonly PetStage[] = ["acorn", "young", "adult", "veteran"];
const MAX_COVERS = 4;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isMinutes = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

function parseCover(v: unknown): ItemRef | null {
  if (!isObject(v)) return null;
  const { type, id, title, coverUrl, times } = v;
  if (!ITEM_TYPES.includes(type as ItemRef["type"]) || typeof id !== "string" || typeof title !== "string" || !title) return null;
  const url = typeof coverUrl === "string" && /^https?:\/\//i.test(coverUrl) ? coverUrl : null;
  return { type: type as ItemRef["type"], id, title, coverUrl: url, times: isCount(times) && times > 0 ? times : 1 };
}

function parsePet(v: unknown): OwnPet | null {
  if (!isObject(v)) return null;
  const { name, petClass, stage } = v;
  if (typeof name !== "string" || !name || !isPetClass(petClass) || !PET_STAGES.includes(stage as PetStage)) return null;
  return { name, petClass, stage: stage as PetStage };
}

/** Valida el ShareSummary de un share; `null` = no se puede pintar (el post se descarta). */
export function parseShareSummary(raw: unknown): ShareSummary | null {
  if (!isObject(raw)) return null;
  const { kind, periodStart, periodEnd, narrator, palette, minutes, episodesWithoutRuntime, finished, covers, pet, seriesProgress } = raw;
  if (!isWrapUpKind(kind)) return null;
  if (typeof periodStart !== "string" || !ISO_DAY.test(periodStart)) return null;
  if (typeof periodEnd !== "string" || !ISO_DAY.test(periodEnd)) return null;
  if (!(NARRATOR_STATES as readonly unknown[]).includes(narrator)) return null;
  if (!PALETTES.includes(palette as Palette)) return null;
  if (!isMinutes(minutes) || !isCount(episodesWithoutRuntime) || !isCount(finished)) return null;
  if (!Array.isArray(covers)) return null;
  return {
    kind, periodStart, periodEnd,
    narrator: narrator as ShareSummary["narrator"], palette: palette as Palette,
    minutes, episodesWithoutRuntime, finished,
    ...(isObject(seriesProgress) && isCount(seriesProgress.count) && seriesProgress.count > 0
      && (seriesProgress.episodes === null || isCount(seriesProgress.episodes))
      ? { seriesProgress: {count: seriesProgress.count, episodes: seriesProgress.episodes} } : {}),
    covers: covers.map(parseCover).filter((c): c is ItemRef => c !== null).slice(0, MAX_COVERS),
    pet: parsePet(pet),
  };
}

type WrapUpRowLike = { kind: string; anchor_type: string; anchor_id: string };

/** ¿Es un post de crónica publicada? (kind y ancla, como las experiencias). */
export function isWrapUpRow(row: WrapUpRowLike): boolean {
  return row.kind === "wrap_up" && row.anchor_type === "wrap_up";
}

/** Resúmenes visibles por id de share (los que la RLS no deja ver no vuelven). */
export async function loadWrapUpShares(supabase: Client, rows: WrapUpRowLike[]): Promise<Map<string, ShareSummary>> {
  const ids = [...new Set(rows.map((r) => r.anchor_id))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("wrap_up_shares").select("id, summary").in("id", ids);
  if (error) throw error;
  const out = new Map<string, ShareSummary>();
  for (const row of data ?? []) {
    const summary = parseShareSummary(row.summary);
    if (summary) out.set(row.id, summary);
  }
  return out;
}
