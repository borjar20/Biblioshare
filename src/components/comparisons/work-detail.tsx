'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
export function WorkDetail({ snapshot, view, work, onEvidenceHeight }: { snapshot: Snapshot; view: Extract<View, { level: 'work' }>; work: CatalogWork; onEvidenceHeight?: (height: number) => void }) {
  const t = useTranslations('comparisons');
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ request: string; result: Result<Detail> } | null>(null);
  const evidence = useRef<HTMLDivElement>(null);
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
  useLayoutEffect(() => {
    const element = evidence.current; if (!element || !onEvidenceHeight) return;
    const measure = () => onEvidenceHeight((element.offsetTop || (typeof matchMedia !== 'undefined' && matchMedia('(max-width: 400px)').matches ? 320 : 400)) + element.scrollHeight + 40);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [result, onEvidenceHeight]);
  const title = work.metadataMissing || !work.title ? t('missingMetadata') : work.title;
  const [media, id] = work.key.split(':') as [Media, string];
  return <section className={styles.detail} aria-label={t('workDetail')} aria-busy={!result}>
    <header className={styles.detailHeading}><p>{t(`media.${media}`)}</p><h3>{title}</h3></header>
    <div ref={evidence} className={styles.detailEvidence}>
      {!result && <p role="status">{t('loadingWork')}</p>}
      {result && !result.ok && <div role="alert"><p>{t('detailFailed')}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</button></div>}
      {result?.ok && <>
        {media === 'series' && <h4>{t('seriesGeneralNotes')}</h4>}
        <dl className={styles.peopleNotes}>{people.map(userId => {
          const person = result.data.people.find(item => item.userId === userId);
          const member = snapshot.group.members.find(item => item.userId === userId);
          return <div key={userId}><dt>{member?.name ?? t('unavailablePerson')}</dt><dd>
            <strong>{person ? person.rating === null ? t('unrated') : t('rating', { rating: person.rating }) : t('noVisibleRecord')}</strong>
            {person?.orderUnknown && <small>{t('orderUnknown')}</small>}
            {media === 'series' && person && !person.progress && <small>{t('progressUnavailable')}</small>}
            {person?.progress && <><small>{t('seenEver', { count: person.progress.seenEver })}</small>
              <small>{person.progress.current === null ? t('noCurrentPass') : t('currentProgress', { count: person.progress.current, total: person.progress.aired ?? t('unknownTotal') })}</small>
              {person.progress.status && <small>{t(`progressStatus.${person.progress.status === 'abandoned' ? 'abandoned' : person.progress.status === 'finished' ? 'finished' : 'active'}`)}</small>}</>}
          </dd></div>;
        })}</dl>
        {media === 'series' && <section aria-label={t('commonEpisodes')} className={styles.episodeEvidence}><h4>{t('commonEpisodes')}</h4><p>{t('episodeNotesMeaning')}</p>
          {!result.data.commonEpisodes.length && <p>{t('noCommonEpisodes')}</p>}
          {result.data.commonEpisodes.map(episode => <div key={`${episode.season}:${episode.episode}`}><h5>{t('episodeLabel', { season: episode.season, episode: episode.episode })}</h5><ul>{people.map(userId => <li key={userId}>{t('episodePersonRating', { name: snapshot.group.members.find(member => member.userId === userId)?.name ?? t('unavailablePerson'), rating: episode.notes.find(note => note.userId === userId)?.rating ?? t('unrated') })}</li>)}</ul></div>)}
        </section>}
        {media === 'series' && snapshot.excludedSeriesWithoutEpisodes > 0 && <p>{t('excludedHistoricalSeries', { count: snapshot.excludedSeriesWithoutEpisodes })}</p>}
        {!result.data.work.metadataMissing && <a href={itemHref(media, id)}>{t('openItem')}</a>}
      </>}
    </div>
  </section>;
}
