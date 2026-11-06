"use client";

import { PetSprite } from "@/components/pet/pet-sprite";
import type { SorteoPet } from "@/lib/rincon/load-sorteo";
import styles from "./sorteo-stage.module.css";

export type Speech = { title?: string; text: string; mood: "idle" | "sad" | "joy" } | null;

// La mascota sentada en lo alto del mueble con su bocadillo (spec «La voz»).
// Sin mascota (o con la compañera oculta) habla un narrador: el mismo bocadillo sin sprite.
export function StagePet({ pet, speech, entered }: { pet: SorteoPet | null; speech: Speech; entered: boolean }) {
  const bubble = (
    <div className={`${styles.bubble} ${speech ? "" : styles.off}`} role="status" aria-live="polite">
      {speech && (<>{speech.title && <b>{speech.title}. </b>}{speech.text}</>)}
    </div>
  );
  if (!pet || pet.stage === "acorn") return <div className={styles.narrator}>{bubble}</div>;
  return (
    <>
      {bubble}
      <div className={`${styles.pet} ${entered ? styles.in : ""}`}>
        <div className={styles["sprite-box"]}>
          <PetSprite
            stage={pet.stage}
            petClass={pet.petClass}
            mood={speech?.mood === "sad" ? "sad" : "happy"}
            reaction={speech?.mood === "joy" ? "joy" : null}
            scale={1}
            label={pet.name}
          />
        </div>
      </div>
    </>
  );
}
