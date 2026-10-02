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
  // Visionado conjunto (#1220). No lo crea `createPost`: lo publica la base al
  // primer «aceptar» (`respond_joint_viewing`), con autor = quien creó el
  // visionado y fuente = la fila de `joint_viewings`.
  "joint",
  "experience",
] as const;

export type PostKind = (typeof POST_KINDS)[number];
