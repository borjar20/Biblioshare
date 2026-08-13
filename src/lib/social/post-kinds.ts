// Lista canónica de `posts.kind` (enum public.post_kind, 20260844_posts.sql).
//
// Vive en su propio módulo, y no en post-actions.ts, porque post-actions.ts es
// `"use server"`: notify-categories.ts lo importan componentes CLIENTE
// (notify-bell.tsx) y no puede arrastrar un módulo de server actions al bundle
// del navegador. Aquí no hay ninguna dependencia, solo la lista.

export const POST_KINDS = [
  "thought",
  "progressed",
  "started",
  "finished",
  "dropped",
  "watched",
] as const;

export type PostKind = (typeof POST_KINDS)[number];
