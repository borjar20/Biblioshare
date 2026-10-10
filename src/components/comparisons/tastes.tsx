'use client';
import { useTranslations } from 'next-intl';
import { facets } from '@/lib/comparisons/derive';
import type { FacetKind, Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { TasteControls, View, WorkOrigin } from './state';
import { ComparisonCanvas } from './canvas';
import styles from './canvas.module.css';

type Props = { snapshot: Snapshot; people: string[];
  onOpenWork: (key: WorkKey, origin: Extract<WorkOrigin, { kind: 'facet' }>) => void;
  view: View; onView: (view: View) => void; controls: TasteControls; onControlsChange: (controls: TasteControls) => void };
export function Tastes({ snapshot, people, onOpenWork, view, onView, controls, onControlsChange }: Props) {
  const t = useTranslations('comparisons');
  const available = new Set(snapshot.group.members.filter(member => member.available && member.userId).map(member => member.userId));
  if (people.length < 2 || people.length > 10 || new Set(people).size !== people.length || people.some(id => !available.has(id))) return <p>{t('chooseTastePeople')}</p>;
  const name = (id: string) => snapshot.group.members.find(member => member.userId === id)?.name ?? t('unavailablePerson');
  const categories = facets(snapshot, people, controls.facetKind, controls.signal);
  const largestConsumption = Math.max(1, ...categories.flatMap(category => category.people.map(person => person.consumed.length)));
  const bubbleSize = (count: number) => 80 * Math.sqrt(count / largestConsumption);
  const selectedId = view.level === 'facet' ? view.facetId : view.level === 'work' && view.origin.kind === 'facet' ? view.origin.facetId : null;
  const selected = categories.find(category => category.id === selectedId);
  const isWork = view.level === 'work';
  const catalog = new Map(snapshot.catalog.map(work => [work.key, work]));
  const title = (key: WorkKey) => { const work = catalog.get(key); return !work?.title || work.metadataMissing ? t('missingMetadata') : work.title; };
  const keys = [...new Set(selected?.people.flatMap(person => person.consumed) ?? [])];
  return <div className={styles.tastes}>
    <div hidden={isWork} inert={isWork}>
      <div className={styles.signals} aria-label={t('tasteSignals')}>{(['consumed', 'rated'] as const).map(signal => <button key={signal} type="button" aria-pressed={controls.signal === signal} onClick={() => onControlsChange({ ...controls, signal })}>{t(`tasteSignal.${signal}`)}</button>)}</div>
      <h3>{t(`tasteSignal.${controls.signal}`)}</h3>
      <p>{t(controls.signal === 'consumed' ? 'consumptionMeaning' : 'valuationMeaning')}</p>
      <label>{t('facetSelector')} <select value={controls.facetKind} onChange={event => { onControlsChange({ ...controls, facetKind: event.target.value as FacetKind }); onView({ level: 'group' }); }}>{(['genre', 'author', 'director'] as const).map(kind => <option key={kind} value={kind}>{t(`facetKinds.${kind}`)}</option>)}</select></label>
      {controls.facetKind === 'genre' && <p className={styles.caption}>{t('overlappingGenres')}</p>}
      <div className={styles.coverage}>{people.map(userId => {
        const eligible = [...new Set(snapshot.works.filter(work => work.userId === userId).map(work => work.key))];
        const covered = new Set(categories.flatMap(category => category.people.find(person => person.userId === userId)?.consumed ?? []));
        return <p key={userId}>{t('metadataCoverage', { name: name(userId), count: covered.size, total: eligible.length })}</p>;
      })}</div>
      {!categories.length && <p>{t('noFacetMetadata')}</p>}
      <div className={styles.facetList}>{(selected ? [selected] : categories).map(category => <section key={category.id} aria-label={category.label} className={styles.facet}>
        <h4>{category.label}</h4>
        <div className={styles.facetPeople}>{category.people.map(person => <div key={person.userId}>
          <h5>{name(person.userId)}</h5>
          {controls.signal === 'consumed' ? <><span className={styles.consumptionBubble} data-consumption-count={person.consumed.length} style={{ width: bubbleSize(person.consumed.length), height: bubbleSize(person.consumed.length) }} aria-hidden="true">{person.consumed.length || ''}</span><p>{t('consumedBase', { count: person.consumed.length, total: person.eligibleTotal })}</p></> : <>
            <output aria-label={t('ratedSample', { count: person.rated.length })}>{person.mean == null ? t('unrated') : person.mean.toFixed(1)}</output>
            <p>{t('ratedSample', { count: person.rated.length })}</p><p>{person.min === null ? t('noRatingRange') : t('ratingRange', { min: person.min, max: person.max! })}</p>
          </>}
        </div>)}</div>
        {controls.signal === 'rated' && (category.people.every(person => person.rated.length >= 3) ? <p>{t('jointTrendSample')}</p> : <p role="status">{t('insufficientTasteSample', { names: category.people.filter(person => person.rated.length < 3).map(person => name(person.userId)).join(', ') })}</p>)}
        {!selected && <button type="button" onClick={() => onView({ level: 'facet', people, facetKind: controls.facetKind, facetId: category.id })}>{t('exploreFacet', { label: category.label })}</button>}
        {selected && <div className={styles.facetEvidence}>{category.people.map(person => <section key={person.userId} aria-label={t('personEvidence', { name: name(person.userId) })}><h5>{name(person.userId)}</h5><ul>{person.consumed.map(key => <li key={key}>{t('individualWorkRating', { title: title(key), rating: snapshot.works.find(work => work.userId === person.userId && work.key === key)?.rating ?? t('unrated') })}</li>)}</ul>{!person.consumed.length && <p>{t('noVisibleRecord')}</p>}</section>)}</div>}
      </section>)}</div>
    </div>
    {selected && <ComparisonCanvas snapshot={snapshot} view={view} onView={onView} facetKeys={keys} onOpenFacetWork={key => onOpenWork(key, { kind: 'facet', facetKind: controls.facetKind, facetId: selected.id })}/>}
    {snapshot.excludedSeriesWithoutEpisodes > 0 && !isWork && <p className={styles.caption}>{t('excludedHistoricalSeries', { count: snapshot.excludedSeriesWithoutEpisodes })}</p>}
  </div>;
}
