import type { PetClass, PetMood, PetStage } from "./classes";
import { PET_SHEETS, type AcornAnimName, type AcornSheetEntry, type PetAnimName, type SheetBox, type SheetEntry } from "./sheets.gen";

// Fuente de verdad de qué sheet va dónde y qué animación toca (spec
// sprites-personaje §5). El layout de cada sheet lo genera fetch-character.mjs
// en sheets.gen.ts; manifest.test.ts comprueba que existe cada PNG.
export type DrawnStage = Exclude<PetStage, "acorn">;
export type PetDirection = "south" | "south-east" | "east" | "north-east" | "north" | "north-west" | "west" | "south-west";
export const DRAWN_STAGES = ["young", "adult", "veteran"] as const satisfies readonly DrawnStage[];
// Única dirección con animaciones (enmienda 2026-09-03, Task 2b): la mascota se muestra y anima
// a 3/4 mirando a la izquierda del espectador. PetSprite y fetch-character.mjs la leen de aquí,
// nunca de un literal "south"/"south-west" propio — la bellota (acornEntryFrom) es la excepción:
// sigue en "south", no tiene rotaciones de 8 direcciones.
export const PET_FACING = "south-west" as const satisfies PetDirection;

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

// `?v=<hash>` (#1058): el SW cachea los PNG caché-primero por URL completa. El nombre del fichero no
// cambia en un re-roll pero el hash (sha1 del PNG, en sheets.gen.ts, que viaja dentro del JS hasheado
// de Next) sí, así que un cliente que vuelve pide el PNG nuevo en vez de pintar las filas nuevas
// sobre el PNG viejo. Ya no hace falta subir CACHE_NAME al regenerar un sheet.
export function sheetSrc(stage: DrawnStage, cls: PetClass): string {
  return `/pet/sheets/${stage}/${cls}.png?v=${sheetEntry(stage, cls).hash}`;
}

export function sheetEntry(stage: DrawnStage, cls: PetClass): SheetEntry {
  const e = PET_SHEETS[stage][cls];
  if (!e) throw new Error(`sheets.gen.ts sin entrada para ${stage}/${cls}: corre fetch-character.mjs`);
  return e;
}

export function acornSrc(): string {
  return `/pet/sheets/acorn.png?v=${acornEntry().hash}`;
}

export function acornEntry(): AcornSheetEntry {
  const e = PET_SHEETS.acorn;
  if (!e) throw new Error("sheets.gen.ts sin entrada acorn: corre pack-strip.mjs y fetch-character.mjs --gen");
  return e;
}

// Caja real del personaje dentro de la celda (unión de todos los frames del sheet, en px de celda a
// escala 1). La compañera la usa como zona táctil (#1074): la celda de 92-104 px lleva un 30-40 % de
// relleno transparente que no debe interceptar taps sobre lo que haya debajo.
export function spriteBox(stage: PetStage, cls: PetClass): { cell: number; box: SheetBox } {
  const e = stage === "acorn" ? acornEntry() : sheetEntry(stage, cls);
  return { cell: e.cell, box: e.box };
}

// Duración (ms) de cada reacción de un solo disparo, para los `setTimeout` que la apagan en
// pet-detail.tsx y pet-companion.tsx (antes duplicada en los dos componentes, desacoplada del
// manifiesto). `joy` = 9 frames @ 10 fps de PET_MANIFEST.anims.joy (manifest.test.ts lo
// comprueba); `evolve` no tiene fila propia — es el destello fijo de 1.2s de la regla
// `@keyframes evolve` en pet-sprite.module.css, así que aquí es un literal.
export const REACTION_MS = { joy: 900, evolve: 1200 } as const;
