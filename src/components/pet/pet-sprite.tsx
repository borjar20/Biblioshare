import type { CSSProperties } from "react";
import type { PetClass, PetMood, PetStage } from "@/lib/pet/classes";
import { PET_MANIFEST, sheetEntry, sheetSrc, type PetDirection } from "@/lib/pet/manifest";
import type { PetAnimName } from "@/lib/pet/sheets.gen";
import styles from "./pet-sprite.module.css";

export type PetReaction = "joy" | "evolve" | null;

// Tamaño nativo del PNG de la bellota (public/pet/acorn.png).
const ACORN_PX = 40;

// Un @keyframes por fila (ver el comentario largo en pet-sprite.module.css): CSS solo
// reinicia una animación cuando `animation-name` CAMBIA de valor, así que idle y joy no
// pueden compartir nombre o el paso reaction=null → "joy" sin desmontar (pet-companion.tsx)
// no reiniciaría nada y la fila se pintaría congelada en su último frame.
const STRIP_BY_ANIM: Record<PetAnimName, "stripIdle" | "stripSleepy" | "stripSad" | "stripJoy"> = {
  idle: "stripIdle",
  sleepy: "stripSleepy",
  sad: "stripSad",
  joy: "stripJoy",
};

export interface PetSpriteProps {
  stage: PetStage;
  petClass: PetClass;
  mood: PetMood;
  /** 1 = una celda (52–56 px según la entrada), 2 = página, 3 = eclosión. */
  scale: 1 | 2 | 3;
  reaction?: PetReaction;
  /** Solo la sur tiene animaciones en esta fase; otra dirección pinta el frame de rotación quieto. */
  direction?: PetDirection;
  /** Nombre accesible (el nombre de la mascota). */
  label: string;
}

// Pinta UNA celda del spritesheet de PixelLab (spec sprites-personaje §6). Sin
// "use client": no tiene estado; la animación es CSS (`background-position-x`
// con steps()) y la reacción llega por prop desde quien sí tiene estado.
export function PetSprite({ stage, petClass, mood, scale, reaction = null, direction = "south", label }: PetSpriteProps) {
  if (stage === "acorn") {
    const size = ACORN_PX * scale;
    return (
      <div className={styles.root} style={{ width: size, height: size }} role="img" aria-label={label} data-mood={mood} data-reaction={reaction ?? undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- pixel art: next/image reescalaría con filtro bilineal */}
        <img src={PET_MANIFEST.acorn.src} alt="" width={size} height={size} />
      </div>
    );
  }

  const entry = sheetEntry(stage, petClass);
  const px = entry.cell * scale;
  // `direction` sin llamadores hoy (todo el mundo pasa "south", el valor por defecto):
  // la lleva el paseo de la mascota, #1057.
  const animated = direction === "south";
  const anim = reaction === "joy" ? "joy" : PET_MANIFEST.moodAnim[mood];
  const row = animated ? entry.anims[anim] : { row: entry.rotationsRow, frames: 1 };
  const col = animated ? 0 : Math.max(0, entry.directions.indexOf(direction));

  const style: Record<string, string | number> = {
    width: px,
    height: px,
    backgroundImage: `url(${sheetSrc(stage, petClass)})`,
    backgroundSize: `${entry.width * scale}px ${entry.height * scale}px`,
    "--pet-cell": `${px}px`,
    "--pet-row": row.row,
    "--pet-col": col,
  };

  // Los parámetros de la animación dependen de datos (fps, nº de frames) y no pueden vivir
  // en custom properties dentro del shorthand `animation`: si el elemento no tuviera esas
  // variables (rama bellota, rama de dirección estática) el shorthand quedaría inválido en
  // tiempo de cómputo. Por eso se calculan aquí y se ponen como longhands en línea, que
  // siempre ganan a cualquier regla de la hoja de estilos que no sea `!important`. Solo la
  // rama animada (dirección sur) los necesita — --pet-frames también, para el @keyframes
  // de la fila; el resto de ramas no animan nada por CSS var, así que no se emiten. Con
  // `reaction="evolve"` se añade `styles.evolve` como segunda animación en cada longhand
  // (listas separadas por comas) para que las dos corran a la vez, en vez de que el
  // shorthand de evolve (una sola animación) sustituya al de la fila y congele el sprite en
  // el frame 0. `animationName` puesto en línea se compara contra el nombre YA hasheado
  // por CSS Modules (Lightning CSS/Turbopack escala también los `@keyframes`, igual que
  // las clases) — por eso se lee de `styles[STRIP_BY_ANIM[anim]]` / `styles.evolve` en vez
  // de escribir el literal ("stripIdle", etc.): ese literal no encontraría ninguna regla y
  // el sprite se quedaría congelado. `:global()` en el nombre del @keyframes NO es una
  // alternativa aquí: Lightning CSS solo lo admite como pseudoclase de selector, no como
  // nombre de @keyframes. Y el nombre tiene que depender de `anim` (una fila por animación,
  // ver STRIP_BY_ANIM arriba y el comentario largo en pet-sprite.module.css) para que un
  // cambio de humor/reacción sin desmontar SIEMPRE reinicie el strip.
  if (animated) {
    const { fps, loop } = PET_MANIFEST.anims[anim];
    style["--pet-frames"] = row.frames;
    const duration = `${row.frames / fps}s`;
    const timing = `steps(${row.frames})`;
    const iterations = loop ? "infinite" : 1;
    const stripName = styles[STRIP_BY_ANIM[anim]];
    if (reaction === "evolve") {
      style.animationName = `${stripName}, ${styles.evolve}`;
      style.animationDuration = `${duration}, 1.2s`;
      style.animationTimingFunction = `${timing}, ease-out`;
      style.animationIterationCount = `${iterations}, 1`;
    } else {
      style.animationName = stripName;
      style.animationDuration = duration;
      style.animationTimingFunction = timing;
      style.animationIterationCount = iterations;
    }
  }

  return (
    <div
      className={`${styles.root} ${styles.sheet}${animated ? ` ${styles.animated}` : ""}`}
      style={style as CSSProperties}
      role="img"
      aria-label={label}
      data-mood={mood}
      data-reaction={reaction ?? undefined}
      data-anim={animated ? anim : undefined}
      data-frames={animated ? row.frames : undefined}
      data-col={animated ? undefined : col}
    />
  );
}
