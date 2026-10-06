// Póster pixel (spec 2026-10-06 §5): pinta un PosterModel según su `layout`.
// Sin estado: todo el texto llega ya escrito en el modelo, así que lo que lee
// el lector de pantalla es exactamente lo que se ve (h2 = cifra con su unidad,
// un <p> por línea). Los sprites son decoración (`aria-hidden`), salvo la
// ardilla propia, que lleva el nombre de la mascota como etiqueta.
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { PetSprite } from "@/components/pet/pet-sprite";
import { narratorSheet } from "@/lib/wrap-ups/narrator";
import type { NarratorVariant, OwnPet, Palette } from "@/lib/wrap-ups/types";
import type { PosterModel } from "@/lib/wrap-ups/view-models";
import { PosterCover } from "./poster-cover";
import styles from "./poster.module.css";

/** Campo de color por paleta; `mixed` (periodo repartido) va en terracota. */
export const POSTER_FIELD: Record<Palette, string> = {
  book: "var(--type-book)",
  movie: "var(--type-movie)",
  series: "var(--type-series)",
  mixed: "var(--accent)",
};

export type PosterProps = {
  model: PosterModel;
  palette: Palette;
  narrator: NarratorVariant;
  pet: OwnPet | null;
  showPet: boolean;
};

export function Poster({ model, palette, narrator, pet, showPet }: PosterProps) {
  const { layout, eyebrow, figure, lines } = model;
  // Un h2 por póster: la cifra si la hay; en los «hero», el título; si no, el rótulo.
  const heroHeading = layout === "hero" && lines.length > 0;
  const eyebrowIsHeading = !figure && !heroHeading;
  const restLines = heroHeading ? lines.slice(1) : lines;

  return (
    <article lang="es" className={styles.poster} style={{ "--field": POSTER_FIELD[palette] } as CSSProperties} data-layout={layout}>
      {eyebrowIsHeading
        ? <h2 className={styles.eyebrow}>{eyebrow}</h2>
        : <p className={styles.eyebrow}>{eyebrow}</p>}

      <div className={`${styles.body} ${styles.enter}`}>
        {heroHeading && <h2 className={`${styles.plate} ${styles.heroTitle}`}>{lines[0]}</h2>}
        <LayoutBody model={model} />
        {layout !== "quote" && <Lines lines={restLines} />}
        {showPet && pet && (
          <div className={styles.pet}>
            <PetSprite stage={pet.stage} petClass={pet.petClass} mood="happy" scale={layout === "closing" ? 1 : 2} label={pet.name} />
          </div>
        )}
      </div>

      {model.narratorLine && (
        <div className={styles.narrator}>
          <div className={styles.narratorStamp} aria-hidden="true">
            <NarratorSprite variant={narrator} />
          </div>
          <p className={styles.bubble}>{model.narratorLine}</p>
        </div>
      )}
    </article>
  );
}

function LayoutBody({ model }: { model: PosterModel }) {
  const { layout, figure, covers, strip, ranking, quote, lines } = model;
  switch (layout) {
    case "hero":
      return null;
    case "figure":
      return figure ? <Figure figure={figure} /> : null;
    case "covers":
    case "closing":
      return (
        <>
          {figure && <Figure figure={figure} />}
          {covers && covers.length > 0 && <Covers covers={covers} />}
        </>
      );
    case "strip":
      return (
        <>
          {figure && <Figure figure={figure} />}
          {strip && strip.length > 0 && <Strip cells={strip} showValues={model.stripValues} />}
        </>
      );
    case "ranking":
      return ranking && ranking.length > 0 ? (
        <ol className={`${styles.plate} ${styles.ranking}`}>
          {ranking.map((r, i) => (
            <li key={`${r.label}-${i}`} className={styles.rankingItem}>
              <span className={styles.rankingIndex} aria-hidden="true">{i + 1}</span>
              <span className={styles.rankingLabel}>{r.label}</span>
              <span className={styles.rankingValue}>{r.value}</span>
            </li>
          ))}
        </ol>
      ) : null;
    case "quote":
      return (
        <>
          {(figure || (covers && covers.length > 0)) && (
            <div className={styles.quoteRow}>
              {covers && covers.length > 0 && <Covers covers={covers.slice(0, 1)} />}
              {figure && <Figure figure={figure} />}
            </div>
          )}
          {/* En la cita, las líneas (título o procedencia) van ANTES del texto citado. */}
          <Lines lines={lines} />
          {quote && (
            <blockquote className={`${styles.plate} ${styles.quote}`}>
              <p>{quote.body}</p>
              {quote.attribution && <footer>— {quote.attribution}</footer>}
            </blockquote>
          )}
        </>
      );
  }
}

function Figure({ figure }: { figure: { value: string; unit: string } }) {
  return (
    <h2 className={`${styles.plate} ${styles.figure}`}>
      <span className={styles.figureValue}>{figure.value}</span>{" "}
      <span className={styles.figureUnit}>{figure.unit}</span>
    </h2>
  );
}

function Lines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className={`${styles.plate} ${styles.lines}`}>
      {lines.map((l, i) => <p key={i}>{l}</p>)}
    </div>
  );
}

function Covers({ covers }: { covers: NonNullable<PosterModel["covers"]> }) {
  return (
    <ul className={styles.covers}>
      {covers.slice(0, 4).map((c) => <PosterCover key={`${c.type}-${c.id}`} item={c} />)}
    </ul>
  );
}

function Strip({ cells, showValues = false }: { cells: NonNullable<PosterModel["strip"]>; showValues?: boolean }) {
  const t = useTranslations("wrapUps.ui");
  return (
    <ol data-values={showValues} className={`${styles.plate} ${styles.strip}`} style={{ "--cells": cells.length } as CSSProperties}>
      {cells.map((c, i) => (
        <li key={i} className={styles.stripCell} data-active={c.active}>
          <span aria-hidden={showValues ? undefined : true}>{c.label}</span>
          <span className={styles.stripMark} aria-hidden="true" />
          <span className={showValues ? styles.stripValue : "sr-only"}>
            {showValues ? c.value : `${c.value}: ${c.active ? t("dayActive") : t("dayInactive")}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Narradora común: tira horizontal animada con steps(), como pet-sprite.module.css. */
function NarratorSprite({ variant }: { variant: NarratorVariant }) {
  const { src, cell, frames, fps } = narratorSheet(variant);
  const style: Record<string, string | number> = {
    width: cell,
    height: cell,
    backgroundImage: `url(${src})`,
    backgroundSize: `${cell * frames}px ${cell}px`,
    "--n-cell": `${cell}px`,
    "--n-frames": frames,
    // Longhands en línea (ver pet-sprite.tsx): el nombre del @keyframes es el hasheado del módulo.
    animationName: styles.narratorIdle,
    animationDuration: `${frames / fps}s`,
    animationTimingFunction: `steps(${frames})`,
    animationIterationCount: "infinite",
  };
  return <span className={styles.narratorSprite} style={style as CSSProperties} data-variant={variant} />;
}
