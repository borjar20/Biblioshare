import type { CSSProperties, ReactNode } from "react";
import type { PetClass, PetMood, PetStage } from "@/lib/pet/classes";
import { CANVAS, classLayerSrc, PET_MANIFEST, type PieceSpec } from "@/lib/pet/manifest";
import styles from "./pet-sprite.module.css";

export type PetReaction = "joy" | "evolve" | null;

export interface PetSpriteProps {
  stage: PetStage;
  petClass: PetClass;
  mood: PetMood;
  /** 1 = 40 px (compañera), 2 = 80 px (página), 3 = 120 px (eclosión). */
  scale: 1 | 2 | 3;
  reaction?: PetReaction;
  /** Nombre accesible (el nombre de la mascota). */
  label: string;
}

// Compone piezas y capas a partir del manifiesto: NADIE más sabe de PNG. Sin
// "use client": no tiene estado; las animaciones son CSS puro y la reacción
// llega por prop desde quien sí tiene estado (la compañera / la página).
export function PetSprite({ stage, petClass, mood, scale, reaction = null, label }: PetSpriteProps) {
  const size = CANVAS * scale;
  const box: CSSProperties = { width: size, height: size };

  if (stage === "acorn") {
    return (
      <div className={styles.root} style={box} role="img" aria-label={label} data-mood={mood} data-reaction={reaction ?? undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- pixel art 40×40: next/image reescalaría con filtro bilineal */}
        <img src={PET_MANIFEST.acorn.src} alt="" width={size} height={size} />
      </div>
    );
  }

  const spec = PET_MANIFEST.stages[stage];
  const cls = PET_MANIFEST.classes[petClass];
  const outfit = classLayerSrc(petClass, stage, "outfit");
  const accessory = classLayerSrc(petClass, stage, "accessory");

  const part = (name: "tail" | "body" | "head" | "hand", piece: PieceSpec, extra: ReactNode = null) => (
    <div
      key={name}
      data-part={name}
      className={styles.part}
      style={{ zIndex: piece.z, transformOrigin: `${piece.pivot[0] * scale}px ${piece.pivot[1] * scale}px` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- pixel art 40×40: next/image reescalaría con filtro bilineal */}
      <img src={piece.src} alt="" width={size} height={size} />
      {extra}
    </div>
  );

  return (
    <div className={styles.root} style={box} role="img" aria-label={label} data-mood={mood} data-reaction={reaction ?? undefined}>
      {part("tail", spec.tail)}
      {part(
        "body",
        spec.body,
        cls.outfit.attach === "torso" ? (
          // eslint-disable-next-line @next/next/no-img-element -- pixel art 40×40: next/image reescalaría con filtro bilineal
          <img src={outfit} alt="" width={size} height={size} />
        ) : null,
      )}
      {part(
        "head",
        spec.head,
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- pixel art 40×40: next/image reescalaría con filtro bilineal */}
          <img src={PET_MANIFEST.faces[mood]} alt="" width={size} height={size} />
          {mood !== "sleepy" ? (
            // eslint-disable-next-line @next/next/no-img-element -- pixel art 40×40: next/image reescalaría con filtro bilineal
            <img className={styles.blink} src={PET_MANIFEST.faces.blink} alt="" width={size} height={size} />
          ) : null}
          {cls.outfit.attach === "hat" ? (
            // eslint-disable-next-line @next/next/no-img-element -- pixel art 40×40: next/image reescalaría con filtro bilineal
            <img src={outfit} alt="" width={size} height={size} />
          ) : null}
        </>,
      )}
      {part(
        "hand",
        spec.hand,
        // eslint-disable-next-line @next/next/no-img-element -- pixel art 40×40: next/image reescalaría con filtro bilineal
        <img src={accessory} alt="" width={size} height={size} />,
      )}
    </div>
  );
}
