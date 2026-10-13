'use client';
import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { AtlasOwner, AtlasPerson } from '@/lib/comparisons/atlas/types';
import { initials } from '../presentation';
import styles from './atlas.module.css';

const at = (rating: number) => `${(rating - 1) / 9 * 100}%`;

/** Each person's avatar on one 1–10 scale (Cinema Circle), not an average. */
export function RatingScale({ owners, people }: { owners: AtlasOwner[]; people: AtlasPerson[] }) {
  const t = useTranslations('comparisons');
  const byId = new Map(people.map(person => [person.id, person]));
  const known = owners.filter(owner => byId.has(owner.userId));
  const rated = known.filter((owner): owner is AtlasOwner & { rating: number } => owner.rating !== null);
  const unrated = known.filter(owner => owner.rating === null);
  const list = known.map(owner => `${byId.get(owner.userId)!.name} ${owner.rating ?? t('atlas.opinion.noRating')}`).join(', ');
  const level = new Map<number, number>();
  return <div className={styles.scale} role="img" aria-label={t('atlas.opinion.ratings', { list })}>
    <div className={styles.scaleTrack} aria-hidden="true">
      {rated.map(owner => {
        const stack = level.get(owner.rating) ?? 0; level.set(owner.rating, stack + 1);
        const person = byId.get(owner.userId)!;
        return <span key={owner.userId} className={styles.scaleDot}
          style={{ left: at(owner.rating), bottom: `${stack * 14}px`, background: person.color } as CSSProperties}>{initials(person.name)}</span>;
      })}
    </div>
    <div className={styles.scaleTicks} aria-hidden="true">{[1, 5, 10].map(value => <span key={value} style={{ left: at(value) }}>{value}</span>)}</div>
    {unrated.length > 0 && <p className={styles.scaleNone} aria-hidden="true">
      {unrated.map(owner => byId.get(owner.userId)!.name).join(', ')}: {t('atlas.opinion.noRating')}</p>}
  </div>;
}
