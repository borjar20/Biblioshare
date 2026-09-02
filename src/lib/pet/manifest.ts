import type { PetClass, PetMood, PetStage } from "./classes";

// Fuente de verdad de qué imagen va dónde (spec §5). Coordenadas en el lienzo
// lógico de 40×40. Los PNG de esta fase los genera scripts/pet-sprites.mjs; el
// arte IA curado los sustituirá CON LOS MISMOS NOMBRES. manifest.test.ts
// comprueba que cada fichero existe.
export const CANVAS = 40;

export type PieceSpec = { src: string; pivot: [number, number]; z: number };
export type StageSpec = { head: PieceSpec; body: PieceSpec; tail: PieceSpec; hand: PieceSpec };
export type DrawnStage = Exclude<PetStage, "acorn">;
export type ClassLayer = "outfit" | "accessory";

const stage = (name: DrawnStage): StageSpec => ({
  tail: { src: `/pet/${name}/tail.png`, pivot: [27, 33], z: 1 },
  body: { src: `/pet/${name}/body.png`, pivot: [15, 35], z: 2 },
  head: { src: `/pet/${name}/head.png`, pivot: [15, 25], z: 3 },
  hand: { src: `/pet/${name}/hand.png`, pivot: [11, 27], z: 4 },
});

export const PET_MANIFEST = {
  acorn: { src: "/pet/acorn.png" },
  stages: {
    young: stage("young"),
    adult: stage("adult"),
    veteran: stage("veteran"),
  } satisfies Record<DrawnStage, StageSpec>,
  faces: {
    happy: "/pet/face/happy.png",
    neutral: "/pet/face/neutral.png",
    sleepy: "/pet/face/sleepy.png",
    sad: "/pet/face/sad.png",
    blink: "/pet/face/blink.png",
  } satisfies Record<PetMood | "blink", string>,
  classes: {
    barbarian: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
    fighter: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
    wizard: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
    cleric: { outfit: { attach: "torso" }, accessory: { attach: "hand" } },
    bard: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
    ranger: { outfit: { attach: "hat" }, accessory: { attach: "hand" } },
  } satisfies Record<PetClass, { outfit: { attach: "hat" | "torso" }; accessory: { attach: "hand" } }>,
} as const;

export function classLayerSrc(cls: PetClass, stage: DrawnStage, layer: ClassLayer): string {
  return `/pet/class/${cls}/${stage}/${layer}.png`;
}
