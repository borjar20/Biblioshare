import { latestRatingPerUser } from "@/lib/community/latest-rating";
import {
  SAGA_ACCENT_SEQUENCE,
  isSagaAccentToken,
  type SagaAccentToken,
} from "./accents";
import type { DetailMember, SagaChildRef } from "./types";

// Agrupación de la pestaña Info y progreso del hero (spec §2.1/§2.3, frames
// A/D). Todo puro: los datos llegan resueltos de get-saga-detail.

export type MemberGroup = {
  /** null = grupo de miembros directos («Nexo» si hay hijas; único grupo si no) */
  sagaId: string | null;
  name: string | null;
  accent: SagaAccentToken;
  members: DetailMember[];
};

const byPositionThenTitle = (a: DetailMember, b: DetailMember) => {
  const pa = a.position ?? Number.MAX_SAFE_INTEGER;
  const pb = b.position ?? Number.MAX_SAFE_INTEGER;
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title);
};

export function groupMembers(
  members: DetailMember[],
  children: SagaChildRef[],
): MemberGroup[] {
  const buckets = new Map<string | null, DetailMember[]>();
  for (const m of members) {
    const key = m.groupSagaId !== null && children.some((c) => c.id === m.groupSagaId)
      ? m.groupSagaId
      : null;
    const bucket = buckets.get(key) ?? [];
    bucket.push(m);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) bucket.sort(byPositionThenTitle);

  const minPos = (list: DetailMember[]) =>
    list.reduce(
      (min, m) => Math.min(min, m.position ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );

  // Grupos = hijas con miembros, ordenadas por su menor position (empate: nombre).
  const childGroups = children
    .filter((c) => buckets.has(c.id))
    .sort((a, b) => {
      const pa = minPos(buckets.get(a.id)!);
      const pb = minPos(buckets.get(b.id)!);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });

  // Colores: accent_color persistido manda; el resto rota SAGA_ACCENT_SEQUENCE
  // saltándose los ya usados, por orden de grupo (estable entre renders).
  const used = new Set<SagaAccentToken>();
  for (const c of childGroups) {
    if (isSagaAccentToken(c.accentColor)) used.add(c.accentColor);
  }
  let rotation = 0;
  const accentFor = (c: SagaChildRef): SagaAccentToken => {
    if (isSagaAccentToken(c.accentColor)) return c.accentColor;
    while (used.has(SAGA_ACCENT_SEQUENCE[rotation % SAGA_ACCENT_SEQUENCE.length])) rotation++;
    const token = SAGA_ACCENT_SEQUENCE[rotation % SAGA_ACCENT_SEQUENCE.length];
    used.add(token);
    return token;
  };

  const groups: MemberGroup[] = childGroups.map((c) => ({
    sagaId: c.id,
    name: c.name,
    accent: accentFor(c),
    members: buckets.get(c.id)!,
  }));

  const direct = buckets.get(null);
  if (direct && direct.length > 0) {
    groups.push({
      sagaId: null,
      name: null,
      accent: children.length > 0 ? "beige" : "terracota",
      members: direct,
    });
  }
  return groups;
}

export function computeProgress(groups: MemberGroup[]): {
  completed: number;
  total: number;
  pct: number;
  segments: Array<{ accent: SagaAccentToken; fraction: number }>;
} {
  const total = groups.reduce((n, g) => n + g.members.length, 0);
  if (total === 0) return { completed: 0, total: 0, pct: 0, segments: [] };
  let completed = 0;
  const segments: Array<{ accent: SagaAccentToken; fraction: number }> = [];
  for (const g of groups) {
    const done = g.members.filter((m) => m.status === "completed").length;
    completed += done;
    if (done > 0) segments.push({ accent: g.accent, fraction: done / total });
  }
  return { completed, total, pct: Math.round((completed / total) * 100), segments };
}

// Media comunitaria de la saga: media (1 decimal, escala 1-10 como el resto de
// la app) de las medias por título; por título cuenta el ÚLTIMO pase puntuado
// de cada usuario (reusa latestRatingPerUser de la ficha de obra).
export function averageSagaRating(
  rows: Array<{ itemKey: string; userId: string; rating: number; finishedOn: string; passId: string }>,
): number | null {
  const byItem = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byItem.get(r.itemKey) ?? [];
    list.push(r);
    byItem.set(r.itemKey, list);
  }
  const itemAvgs: number[] = [];
  for (const list of byItem.values()) {
    // latestRatingPerUser (src/lib/community/latest-rating.ts) espera
    // RatedPass = { id, userId, finishedOn, rating } en camelCase (no
    // snake_case: lo comprobamos contra la firma real antes de mapear aquí).
    const ratings = latestRatingPerUser(
      list.map((r) => ({ id: r.passId, rating: r.rating, finishedOn: r.finishedOn, userId: r.userId })),
    ).map((r) => r.rating);
    if (ratings.length === 0) continue;
    itemAvgs.push(ratings.reduce((a, b) => a + b, 0) / ratings.length);
  }
  if (itemAvgs.length === 0) return null;
  return Math.round((itemAvgs.reduce((a, b) => a + b, 0) / itemAvgs.length) * 10) / 10;
}
