'use client';
import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { AtlasOwner, AtlasPerson } from '@/lib/comparisons/atlas/types';
import { initials } from '../presentation';
import styles from './atlas.module.css';

/** Inset by the dot radius so ratings 1 and 10 stay inside the track. */
const at = (rating: number) => `calc(10px + (100% - 20px) * ${(rating - 1) / 9})`;

/** Each person's avatar on one 1–10 scale (Cinema Circle), not an average. */
export function RatingScale({ owners, people }: { owners: AtlasOwner[]; people: AtlasPerson[] }) {
  const t = useTranslations('comparisons');
  const byId = new Map(people.map(person => [person.id, person]));
  const known = owners.filter(owner => byId.has(owner.userId));
  const rated = known.filter((owner): owner is AtlasOwner & { rating: number } => owner.rating !== null);
  const list = known.map(owner => `${byId.get(owner.userId)!.name} ${owner.rating ?? t('atlas.opinion.noRating')}`).join(', ');
  const level = new Map<number, number>();
  // The track grows with the tallest stack of equal ratings (20px dot + 14px per extra + 8px air).
  const stacks = new Map<number, number>();
  for (const owner of rated) stacks.set(owner.rating, (stacks.get(owner.rating) ?? 0) + 1);
  const height = Math.max(40, 20 + (Math.max(1, ...stacks.values()) - 1) * 14 + 8);
  return <div className={styles.scale} role="img" aria-label={t('atlas.opinion.ratings', { list })}>
    <div className={styles.scaleTrack} style={{ height: `${height}px` }} aria-hidden="true">
      {rated.map(owner => {
        const stack = level.get(owner.rating) ?? 0; level.set(owner.rating, stack + 1);
        const person = byId.get(owner.userId)!;
        return <span key={owner.userId} className={styles.scaleDot}
          style={{ left: at(owner.rating), bottom: `${stack * 14}px`, background: person.color } as CSSProperties}>{initials(person.name)}</span>;
      })}
    </div>
    <div className={styles.scaleTicks} aria-hidden="true">{[1, 5, 10].map(value => <span key={value} style={{ left: at(value) }}>{value}</span>)}</div>
    {/* The numbers in words: equal or close ratings stack or touch on the track, and initials alone do not say the note. */}
    <ul className={styles.scaleValues} aria-hidden="true">{known.map(owner => { const person = byId.get(owner.userId)!;
      return <li key={owner.userId}><span className={styles.ownerDot} style={{ background: person.color }}/>{person.name} <b>{owner.rating ?? t('atlas.opinion.noRating')}</b></li>; })}</ul>
  </div>;
}
