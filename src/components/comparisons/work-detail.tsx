'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { loadComparisonWork } from '@/lib/comparisons/actions';
import { itemHref } from '@/lib/catalog/item-href';
import type { CatalogWork, Media, Result, Snapshot, WorkDetail as Detail } from '@/lib/comparisons/types';
import type { View } from './state';
import styles from './canvas.module.css';

export function detailPeople(view: Extract<View, { level: 'work' }>): string[] {
  const origin = view.origin;
  return origin.kind === 'region' ? view.people.filter((_, index) => origin.mask & (1 << index)) : view.people;
}
/** Metadata only: the cover always stays in the canvas world. */
export function WorkDetail({ snapshot, view, work }: { snapshot: Snapshot; view: Extract<View, { level: 'work' }>; work: CatalogWork }) {
  const t = useTranslations('comparisons');
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ request: string; result: Result<Detail> } | null>(null);
  const people = detailPeople(view);
  const signature = JSON.stringify(people);
  const request = JSON.stringify([snapshot.group.id, snapshot.group.revision, view.key, signature, attempt]);
  useEffect(() => {
    let stale = false;
    void loadComparisonWork(snapshot.group.id, view.key, JSON.parse(signature) as string[])
      .catch((): Result<Detail> => ({ ok: false, code: 'load-failed' }))
      .then(result => { if (!stale) setResponse({ request, result }); });
    return () => { stale = true; };
  }, [snapshot.group.id, view.key, signature, request]);
  const result = response?.request === request ? response.result : null;
  const title = work.metadataMissing || !work.title ? t('missingMetadata') : work.title;
  const [media, id] = work.key.split(':') as [Media, string];
  return <section className={styles.detail} aria-label={t('workDetail')} aria-busy={!result}>
    <header className={styles.detailHeading}><p>{t(`media.${media}`)}</p><h3>{title}</h3></header>
    <div className={styles.detailEvidence}>
      {!result && <p role="status">{t('loadingWork')}</p>}
      {result && !result.ok && <div role="alert"><p>{t('detailFailed')}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</button></div>}
      {result?.ok && <>
        <dl className={styles.peopleNotes}>{people.map(userId => {
          const person = result.data.people.find(item => item.userId === userId);
          const member = snapshot.group.members.find(item => item.userId === userId);
          return <div key={userId}><dt>{member?.name ?? t('unavailablePerson')}</dt><dd>
            <strong>{person ? person.rating === null ? t('unrated') : t('rating', { rating: person.rating }) : t('noVisibleRecord')}</strong>
            {person?.orderUnknown && <small>{t('orderUnknown')}</small>}
            {person?.progress && <><small>{t('seenEver', { count: person.progress.seenEver })}</small>
              <small>{person.progress.current === null ? t('noCurrentPass') : t('currentProgress', { count: person.progress.current, total: person.progress.aired ?? t('unknownTotal') })}</small>
              {person.progress.status && <small>{t(`progressStatus.${person.progress.status === 'abandoned' ? 'abandoned' : person.progress.status === 'finished' ? 'finished' : 'active'}`)}</small>}</>}
          </dd></div>;
        })}</dl>
        {!result.data.work.metadataMissing && <a href={itemHref(media, id)}>{t('openItem')}</a>}
      </>}
    </div>
  </section>;
}
