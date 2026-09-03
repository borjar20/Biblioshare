import type { PetClass, PetMood, PetStage } from "./classes";
import { PET_SHEETS, type PetAnimName, type SheetEntry } from "./sheets.gen";

// Fuente de verdad de qué sheet va dónde y qué animación toca (spec
// sprites-personaje §5). El layout de cada sheet lo genera fetch-character.mjs
// en sheets.gen.ts; manifest.test.ts comprueba que existe cada PNG.
export type DrawnStage = Exclude<PetStage, "acorn">;
export type PetDirection = "south" | "south-east" | "east" | "north-east" | "north" | "north-west" | "west" | "south-west";
export const DRAWN_STAGES = ["young", "adult", "veteran"] as const satisfies readonly DrawnStage[];

export const PET_MANIFEST = {
  acorn: { src: "/pet/acorn.png" },
  anims: {
    idle: { fps: 4, loop: true },
    sleepy: { fps: 3, loop: true },
    sad: { fps: 3, loop: true },
    joy: { fps: 10, loop: false },
  } satisfies Record<PetAnimName, { fps: number; loop: boolean }>,
  // El humor ya no es una capa de cara: es la animación que se reproduce.
  moodAnim: { happy: "idle", neutral: "idle", sleepy: "sleepy", sad: "sad" } satisfies Record<PetMood, PetAnimName>,
} as const;

export function sheetSrc(stage: DrawnStage, cls: PetClass): string {
  return `/pet/sheets/${stage}/${cls}.png`;
}

export function sheetEntry(stage: DrawnStage, cls: PetClass): SheetEntry {
  const e = (PET_SHEETS[stage] as Record<string, SheetEntry>)[cls];
  if (!e) throw new Error(`sheets.gen.ts sin entrada para ${stage}/${cls}: corre fetch-character.mjs`);
  return e;
}
