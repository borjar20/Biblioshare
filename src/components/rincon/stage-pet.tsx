"use client";

import { PetSprite } from "@/components/pet/pet-sprite";
import type { SorteoPet } from "@/lib/rincon/load-sorteo";
import styles from "./sorteo-stage.module.css";

export type Speech = { title?: string; text: string; mood: "idle" | "sad" | "joy" } | null;

// La mascota sentada en lo alto del mueble con su bocadillo (spec «La voz»).
// Sin mascota habla un narrador: el mismo bocadillo sin sprite. La bellota sí
// sale (PetSprite la pinta): antes caía al narrador y parecía que no había mascota.
//
// El bocadillo es SIEMPRE el mismo elemento en la misma posición del árbol: si
// cambiara de rama al llegar la mascota (la carga resuelve con la partida ya
// abierta), el `role="status"` se remontaría y el lector de pantalla podría
// perder el primer anuncio. Narrador o mascota solo cambian una clase y el sprite.
export function StagePet({ pet, speech, entered }: { pet: SorteoPet | null; speech: Speech; entered: boolean }) {
  const narrated = !pet;
  const cls = [styles.bubble, speech ? "" : styles.off, narrated ? styles.narrated : ""].filter(Boolean).join(" ");
  return (
    <>
      <div className={cls} role="status" aria-live="polite">
        {speech && (<>{speech.title && <b>{speech.title}. </b>}{speech.text}</>)}
      </div>
      {!narrated && (
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
      )}
    </>
  );
}
