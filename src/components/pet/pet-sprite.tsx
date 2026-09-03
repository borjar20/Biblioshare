import type { CSSProperties } from "react";
import type { PetClass, PetMood, PetStage } from "@/lib/pet/classes";
import { PET_MANIFEST, sheetEntry, sheetSrc, type PetDirection } from "@/lib/pet/manifest";
import styles from "./pet-sprite.module.css";

export type PetReaction = "joy" | "evolve" | null;

export interface PetSpriteProps {
  stage: PetStage;
  petClass: PetClass;
  mood: PetMood;
  /** 1 = una celda (52 px), 2 = página, 3 = eclosión. */
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
    const size = 40 * scale;
    return (
      <div className={styles.root} style={{ width: size, height: size }} role="img" aria-label={label} data-mood={mood} data-reaction={reaction ?? undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- pixel art: next/image reescalaría con filtro bilineal */}
        <img src={PET_MANIFEST.acorn.src} alt="" width={size} height={size} />
      </div>
    );
  }

  const entry = sheetEntry(stage, petClass);
  const px = entry.cell * scale;
  const animated = direction === "south";
  const anim = reaction === "joy" ? "joy" : PET_MANIFEST.moodAnim[mood];
  const row = animated ? entry.anims[anim] : { row: entry.rotationsRow, frames: 1 };
  const col = animated ? 0 : Math.max(0, entry.directions.indexOf(direction));
  const { fps, loop } = PET_MANIFEST.anims[anim];

  const style = {
    width: px,
    height: px,
    backgroundImage: `url(${sheetSrc(stage, petClass)})`,
    backgroundSize: `${entry.width * scale}px ${entry.height * scale}px`,
    "--pet-cell": `${px}px`,
    "--pet-row": row.row,
    "--pet-col": col,
    "--pet-frames": row.frames,
    "--pet-duration": `${row.frames / fps}s`,
    "--pet-loop": loop ? "infinite" : "1",
  } as CSSProperties;

  return (
    <div
      className={`${styles.root} ${styles.sheet}${animated ? ` ${styles.animated}` : ""}`}
      style={style}
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
