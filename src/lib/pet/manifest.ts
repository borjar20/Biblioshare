import type { PetClass, PetMood, PetStage } from "./classes";
import { PET_SHEETS, type AcornAnimName, type AcornSheetEntry, type PetAnimName, type SheetEntry } from "./sheets.gen";

// Fuente de verdad de qué sheet va dónde y qué animación toca (spec
// sprites-personaje §5). El layout de cada sheet lo genera fetch-character.mjs
// en sheets.gen.ts; manifest.test.ts comprueba que existe cada PNG.
export type DrawnStage = Exclude<PetStage, "acorn">;
export type PetDirection = "south" | "south-east" | "east" | "north-east" | "north" | "north-west" | "west" | "south-west";
export const DRAWN_STAGES = ["young", "adult", "veteran"] as const satisfies readonly DrawnStage[];

export const PET_MANIFEST = {
  // La bellota es un sheet más (empaquetado por pack-strip.mjs): `idle` siempre, `ready` solo en
  // la eclosión con el formulario completo (spec bellota-visor §2).
  acorn: { anims: { idle: { fps: 4, loop: true }, ready: { fps: 6, loop: true } } satisfies Record<AcornAnimName, { fps: number; loop: boolean }> },
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
  const e = PET_SHEETS[stage][cls];
  if (!e) throw new Error(`sheets.gen.ts sin entrada para ${stage}/${cls}: corre fetch-character.mjs`);
  return e;
}

export function acornSrc(): string {
  return "/pet/sheets/acorn.png";
}

export function acornEntry(): AcornSheetEntry {
  const e = PET_SHEETS.acorn;
  if (!e) throw new Error("sheets.gen.ts sin entrada acorn: corre pack-strip.mjs y fetch-character.mjs --gen");
  return e;
}

// Duración (ms) de cada reacción de un solo disparo, para los `setTimeout` que la apagan en
// pet-detail.tsx y pet-companion.tsx (antes duplicada en los dos componentes, desacoplada del
// manifiesto). `joy` = 9 frames @ 10 fps de PET_MANIFEST.anims.joy (manifest.test.ts lo
// comprueba); `evolve` no tiene fila propia — es el destello fijo de 1.2s de la regla
// `@keyframes evolve` en pet-sprite.module.css, así que aquí es un literal.
export const REACTION_MS = { joy: 900, evolve: 1200 } as const;
