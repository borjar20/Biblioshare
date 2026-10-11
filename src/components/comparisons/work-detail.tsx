'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { loadComparisonWork } from '@/lib/comparisons/actions';
import { itemHref } from '@/lib/catalog/item-href';
import type { CatalogWork, Media, Result, Snapshot, WorkDetail as Detail } from '@/lib/comparisons/types';
import type { View } from './state';
import { ComparisonLoading } from './loading';
import { personColor } from './presentation';
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
    <div ref={evidence} className={styles.detailContent}>
    <header className={styles.detailHeading}><p>{t(`media.${media}`)}</p><h3>{title}</h3></header>
    <div className={styles.detailEvidence}>
      {!result && <ComparisonLoading label={t('loadingWork')} compact/>}
      {result && !result.ok && <div role="alert"><p>{t('detailFailed')}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</button></div>}
      {result?.ok && <>
        {media === 'series' && <h4>{t('seriesGeneralNotes')}</h4>}
        <dl className={styles.peopleNotes}>{people.map((userId, index) => {
          const person = result.data.people.find(item => item.userId === userId);
          const member = snapshot.group.members.find(item => item.userId === userId);
          return <div key={userId} style={{ '--person': personColor(snapshot, userId), '--i': index } as CSSProperties}><dt>{member?.name ?? t('unavailablePerson')}</dt><dd>
            <strong>{person ? person.rating === null ? t('unrated') : t('rating', { rating: person.rating }) : t('noVisibleRecord')}</strong>
            {/* Each note on the same 0–10 scale (#1501); an unrated pass is an empty dashed track. */}
            {person && <span className={styles.noteScale} aria-hidden="true" data-unrated={person.rating === null}>{person.rating !== null && <>
              <span className={styles.noteFill} style={{ transform: `scaleX(${person.rating / 10})` }}/><span className={styles.noteDot} style={{ left: `${person.rating * 10}%` }}/></>}</span>}
            {person?.orderUnknown && <small>{t('orderUnknown')}</small>}
            {media === 'series' && person && !person.progress && <small>{t('progressUnavailable')}</small>}
            {person?.progress && <><small>{t('seenEver', { count: person.progress.seenEver })}</small>
              <small>{person.progress.current === null ? t('noCurrentPass') : t('currentProgress', { count: person.progress.current, total: person.progress.aired ?? t('unknownTotal') })}</small>
              {person.progress.status && <small>{t(`progressStatus.${person.progress.status === 'dropped' ? 'abandoned' : person.progress.status === 'completed' ? 'finished' : 'active'}`)}</small>}</>}
          </dd></div>;
        })}</dl>
        {media === 'series' && people.length > 1 && <section aria-label={t('commonEpisodes')} className={styles.episodeEvidence}><h4>{t('commonEpisodes')}</h4><p>{t('commonEpisodeSample', { count: result.data.commonEpisodes.length })}</p><p>{t('episodeNotesMeaning')}</p>
          {!result.data.commonEpisodes.length && <p>{t('noCommonEpisodes')}</p>}
          {result.data.commonEpisodes.map(episode => <div key={`${episode.season}:${episode.episode}`}><h5>{t('episodeLabel', { season: episode.season, episode: episode.episode })}</h5><ul>{people.map(userId => <li key={userId}>{t('episodePersonRating', { name: snapshot.group.members.find(member => member.userId === userId)?.name ?? t('unavailablePerson'), rating: episode.notes.find(note => note.userId === userId)?.rating ?? t('unrated') })}</li>)}</ul></div>)}
        </section>}
        {media === 'series' && people.length === 1 && <p>{t('singlePersonEpisodes')}</p>}
        {!result.data.work.metadataMissing && <Link href={itemHref(media, id)}>{t('openItem')}</Link>}
      </>}
    </div>
    </div>
  </section>;
}
