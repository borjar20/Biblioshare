// src/lib/sagas/derive-shelf.ts
import type { SagaAccentToken } from "./accents";
import type { TimelineRow, TimelineSection } from "./derive-timeline";
import type { SagaGraphNode } from "./map-types";
import type { SagaItemRole } from "./types";

// Modelo de la balda de la ficha de saga (spec 2026-10-27 §2–§4). Puro: entra
// lo que ya produce `deriveTimeline` (o `publicationSections`) y sale lo que
// la balda pinta. Aquí vive TODA la decisión — qué obra es «ahora», qué grupo
// se abre, qué ventana encaja —; los componentes solo pintan.

export type ShelfWorkState = "done" | "now" | "todo";
export type ShelfWork = {
  key: string;            // id del nodo, `i:<tipo>:<uuid>`
  title: string;
  href: string;
  coverUrl: string | null;
  state: ShelfWorkState;
  role: SagaItemRole | null;
  optional: boolean;
  skipped: boolean;
  no: number | null;      // número visible del timeline (no se renumera)
};
export type ShelfSlot =
  | { kind: "work"; work: ShelfWork }
  | { kind: "tandem"; works: ShelfWork[] }
  | {
      kind: "window";
      work: ShelfWork;
      afterTitle: string | null;
      beforeTitle: string | null;
      /** Índices (en `slots` del mismo grupo) de las anclas, o null si el ancla
       *  está en otro grupo o no existe. El componente dibuja el arco entre ellos. */
      spanFrom: number | null;
      spanTo: number | null;
      /** El lector está dentro del tramo y no la ha leído. */
      fitsNow: boolean;
    };
export type ShelfGroupState = "done" | "current" | "future";
export type ShelfGroup = {
  key: string;            // groupSagaId, "root" para miembros directos; "#n" si se repite
  name: string | null;    // null = miembros directos (el componente pone el nombre de la saga)
  accent: SagaAccentToken;
  state: ShelfGroupState;
  counted: number;        // obras que cuentan (no opcionales)
  completed: number;      // de esas, leídas
  slots: ShelfSlot[];     // en orden; opcionales con número incluidas
  extras: ShelfWork[];    // opcionales sin número (ramas): tras un separador
  pileCovers: string[];   // hasta 3 portadas para la pila
};
export type ShelfMode = "next" | "start" | "finished" | "allOptional" | "empty";
export type Shelf = {
  mode: ShelfMode;
  groups: ShelfGroup[];
  openGroupKey: string | null;
  nextUp: { work: ShelfWork; groupName: string | null; fitsNow: ShelfWork | null } | null;
  segments: Array<{ groupKey: string; weight: number; done: number; hasNow: boolean }>;
};

type WindowRef = {
  draft: Draft;
  slot: Extract<ShelfSlot, { kind: "window" }>;
  afterId: string | null;
  beforeId: string | null;
  inside: boolean;
};

type Draft = Omit<ShelfGroup, "state" | "counted" | "completed" | "pileCovers"> & { titleIndex: Map<string, number> };

function toWork(node: SagaGraphNode, no: number | null): ShelfWork {
  return {
    key: node.id,
    title: node.label,
    href: node.href,
    coverUrl: node.coverUrl,
    state: node.status === "completed" ? "done" : "todo",
    role: node.role,
    optional: node.optional,
    skipped: node.skipped,
    no,
  };
}

function slotWorks(slot: ShelfSlot): ShelfWork[] {
  return slot.kind === "tandem" ? slot.works : [slot.work];
}

export function deriveShelf(sections: TimelineSection[], opts: { authenticated: boolean }): Shelf {
  // 1. Grupos: funde consecutivas del mismo groupSagaId; numera repeticiones.
  const drafts: Draft[] = [];
  const seen = new Map<string, number>();
  const windows: WindowRef[] = [];
  // `toWork` reduce el estado a done/todo; aquí se recuerda qué nodos estaban
  // `in_progress` para elegir «ahora».
  const inProgress = new Set<string>();

  for (const section of sections) {
    const base = section.groupSagaId ?? "root";
    const last = drafts.at(-1);
    let draft: Draft;
    if (last && last.key.split("#")[0] === base) {
      draft = last;
    } else {
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      draft = {
        key: count === 1 ? base : `${base}#${count}`,
        name: section.groupName,
        accent: section.accent,
        slots: [],
        extras: [],
        titleIndex: new Map(),
      };
      drafts.push(draft);
    }
    for (const row of section.rows) pushRow(draft, row, windows, inProgress);
  }

  // 2. Anclas de las ventanas, ya con todos los slots del grupo colocados.
  for (const w of windows) {
    w.slot.spanFrom = w.afterId === null ? null : (w.draft.titleIndex.get(w.afterId) ?? null);
    w.slot.spanTo = w.beforeId === null ? null : (w.draft.titleIndex.get(w.beforeId) ?? null);
  }

  // 3. «Ahora»: una sola obra en todo el estante.
  const ordered = drafts.flatMap((d) => d.slots.flatMap(slotWorks));
  const counted = ordered.filter((w) => !w.optional);
  const windowKeys = new Set(windows.map((w) => w.slot.work.key));
  let now: ShelfWork | null = null;
  if (opts.authenticated) {
    // Una ventana en curso sí puede ser «ahora»: la estás leyendo.
    now =
      ordered.find((w) => w.state !== "done" && inProgress.has(w.key)) ??
      ordered.find((w) => w.state !== "done" && !w.optional && !w.skipped && !windowKeys.has(w.key)) ??
      // Una ventana se ofrece como «encaja ahora» solo mientras haya otra cosa
      // que leer; si solo quedan ventanas, la ventana es lo siguiente.
      ordered.find((w) => w.state !== "done" && !w.optional && !w.skipped) ??
      // Última red: una obra que cuenta no deja de contar por un salto huérfano; el modo «next» siempre trae «Te toca».
      ordered.find((w) => w.state !== "done" && !w.optional) ??
      null;
    if (now) now.state = "now";
  }

  // 4. Ventanas que encajan ahora (necesitan el estado definitivo).
  for (const w of windows) w.slot.fitsNow = opts.authenticated && w.inside && w.slot.work.state !== "done";

  // 5. Grupos con su estado.
  const groups: ShelfGroup[] = drafts.map((draft) => {
    const d = { key: draft.key, name: draft.name, accent: draft.accent, slots: draft.slots, extras: draft.extras };
    const works = d.slots.flatMap(slotWorks);
    const c = works.filter((w) => !w.optional);
    const completed = c.filter((w) => w.state === "done").length;
    const state: ShelfGroupState = works.some((w) => w.state === "now")
      ? "current"
      : c.length > 0 && completed === c.length
        ? "done"
        : "future";
    return {
      ...d,
      state,
      counted: c.length,
      completed,
      pileCovers: works.map((w) => w.coverUrl).filter((u): u is string => u !== null).slice(0, 3),
    };
  });

  const openGroupKey =
    groups.find((g) => g.state === "current")?.key ??
    groups.find((g) => g.state !== "done")?.key ??
    groups.at(-1)?.key ??
    null;

  const segments = groups.map((g) => {
    const works = g.slots.flatMap(slotWorks);
    return {
      groupKey: g.key,
      weight: works.length,
      done: works.filter((w) => w.state === "done").length,
      hasNow: works.some((w) => w.state === "now"),
    };
  });

  // 6. Modo y «Te toca».
  const fitsNow = windows.find((w) => w.slot.fitsNow)?.slot.work ?? null;
  const groupOf = (work: ShelfWork) => groups.find((g) => g.slots.some((s) => slotWorks(s).includes(work)));
  let mode: ShelfMode;
  let nextUp: Shelf["nextUp"] = null;
  if (ordered.length === 0) mode = "empty";
  else if (!opts.authenticated) {
    mode = "start";
    const first = counted[0] ?? ordered[0];
    nextUp = { work: first, groupName: groupOf(first)?.name ?? null, fitsNow: null };
  } else if (counted.length === 0) mode = "allOptional";
  else if (counted.every((w) => w.state === "done")) mode = "finished";
  else {
    mode = "next";
    if (now) nextUp = { work: now, groupName: groupOf(now)?.name ?? null, fitsNow };
  }

  return { mode, groups, openGroupKey, nextUp, segments };
}

function pushRow(draft: Draft, row: TimelineRow, windows: WindowRef[], inProgress: Set<string>): void {
  const mark = (node: SagaGraphNode) => {
    if (node.status === "in_progress") inProgress.add(node.id);
    draft.titleIndex.set(node.id, draft.slots.length);
  };
  switch (row.kind) {
    case "entry":
    case "bridge": {
      mark(row.node);
      draft.slots.push({ kind: "work", work: toWork(row.node, row.kind === "entry" ? row.no : null) });
      break;
    }
    case "tandem": {
      row.nodes.forEach(mark);
      draft.slots.push({ kind: "tandem", works: row.nodes.map((nd) => toWork(nd, row.no)) });
      break;
    }
    case "window": {
      mark(row.node);
      const slot: Extract<ShelfSlot, { kind: "window" }> = {
        kind: "window",
        work: toWork(row.node, row.no),
        afterTitle: row.after?.label ?? null,
        beforeTitle: row.before?.label ?? null,
        spanFrom: null,
        spanTo: null,
        fitsNow: false,
      };
      draft.slots.push(slot);
      windows.push({ draft, slot, afterId: row.after?.id ?? null, beforeId: row.before?.id ?? null, inside: row.track?.notice === "dentro" });
      break;
    }
  }
  if (row.kind === "entry" || row.kind === "tandem") {
    for (const b of row.branches) {
      if (b.node.optional) draft.extras.push(toWork(b.node, null));
      else {
        mark(b.node);
        draft.slots.push({ kind: "work", work: toWork(b.node, null) });
      }
    }
  }
}
