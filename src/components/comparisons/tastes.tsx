'use client';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { facets } from '@/lib/comparisons/derive';
import type { CatalogWork, FacetKind, Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { TasteControls, View, WorkOrigin } from './state';
import { ComparisonCanvas } from './canvas';
import { personColor, initials } from './presentation';
import styles from './tastes.module.css';

function EvidenceCover({ work }: { work?: CatalogWork }) {
  const [failed, setFailed] = useState(false);
  return <span className={styles.evidenceCover} aria-hidden="true">{work?.coverUrl && !failed ?
    // eslint-disable-next-line @next/next/no-img-element
    <img src={work.coverUrl} alt="" width="26" height="38" loading="lazy" onError={() => setFailed(true)}/> : <span/>}</span>;
}

type Props = { snapshot: Snapshot; people: string[];
  onOpenWork: (key: WorkKey, origin: Extract<WorkOrigin, { kind: 'facet' }>) => void;
  view: View; onView: (view: View) => void; controls: TasteControls; onControlsChange: (controls: TasteControls) => void };
export function Tastes({ snapshot, people, onOpenWork, view, onView, controls, onControlsChange }: Props) {
  const t = useTranslations('comparisons');
  const origin = useRef<string | null>(null);
  const previouslySelected = useRef(false);
  const host = useRef<HTMLDivElement>(null);
  const selector = useRef<HTMLSelectElement>(null);
  const selectedId = view.level === 'facet' ? view.facetId : view.level === 'work' && view.origin.kind === 'facet' ? view.origin.facetId : null;
  const validPeople = people.length >= 2 && people.length <= 10;
  const categories = validPeople ? facets(snapshot, people, controls.facetKind, controls.signal) : [];
  const selected = categories.find(category => category.id === selectedId);
  useLayoutEffect(() => {
    if (previouslySelected.current && !selected) {
      const target = selectedId === null ? Array.from(host.current?.querySelectorAll<HTMLButtonElement>('[data-facet-origin]') ?? []).find(button => button.dataset.facetOrigin === origin.current) : null;
      (target ?? selector.current ?? host.current)?.focus({ preventScroll: true });
    }
    previouslySelected.current = !!selected;
  }, [selected, selectedId]);
  const available = new Set(snapshot.group.members.filter(member => member.available && member.userId).map(member => member.userId));
  if (people.length < 2 || people.length > 10 || new Set(people).size !== people.length || people.some(id => !available.has(id))) return <p>{t('chooseTastePeople')}</p>;
  const name = (id: string) => snapshot.group.members.find(member => member.userId === id)?.name ?? t('unavailablePerson');
  const largestConsumption = Math.max(1, ...categories.flatMap(category => category.people.map(person => person.consumed.length)));
  const bubbleSize = (count: number) => 80 * Math.sqrt(count / largestConsumption);
  const isWork = view.level === 'work';
  const catalog = new Map(snapshot.catalog.map(work => [work.key, work]));
  const title = (key: WorkKey) => { const work = catalog.get(key); return !work?.title || work.metadataMissing ? t('missingMetadata') : work.title; };
  const keys = [...new Set(selected?.people.flatMap(person => person.consumed) ?? [])];
  const visibleCategory = selected ?? categories[0];
  const uniqueCount = (category: typeof categories[number]) => new Set(category.people.flatMap(person => person.consumed)).size;
  const largestCategory = Math.max(1, ...categories.map(uniqueCount));
  const consumptionCategories = [...categories].sort((a, b) => uniqueCount(b) - uniqueCount(a) || a.label.localeCompare(b.label)).slice(0, 5);
  const bubblePositions = [[27, 23], [76, 23], [50, 58], [15, 84], [85, 84]];
  const categoryColor = (index: number) => ['var(--accent)', 'var(--green)', 'var(--type-series)', 'var(--gold)', 'var(--type-movie)'][index % 5];
  function exploreCategory(id: string) { origin.current = id; onView({ level: 'facet', people, facetKind: controls.facetKind, facetId: id }); }
  return <div ref={host} tabIndex={-1} className={styles.tastes}>
    <div hidden={isWork} inert={isWork}>
      <div className={styles.context}>
        <div className={styles.signals} aria-label={t('tasteSignals')}>{(['consumed', 'rated'] as const).map(signal => <button key={signal} type="button" aria-pressed={controls.signal === signal} onClick={() => onControlsChange({ ...controls, signal })}>{t(`tasteSignal.${signal}`)}</button>)}</div>
        <label className={styles.facetSelector}>{t('facetSelector')} <select ref={selector} value={controls.facetKind} onChange={event => { onControlsChange({ ...controls, facetKind: event.target.value as FacetKind }); onView({ level: 'group' }); }}>{(['genre', 'author', 'director'] as const).map(kind => <option key={kind} value={kind}>{t(`facetKinds.${kind}`)}</option>)}</select></label>
      </div>
      <div className={styles.tasteGrid}>
        <section className={styles.panel} aria-label={t('consumptionTitle')}>
          <span className={styles.signal}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 7 9-5 9 5-9 5Zm0 5 9 5 9-5M3 17l9 5 9-5"/></svg>{t('consumptionSubtitle')}</span>
          <h3>{t('consumptionTitle')}</h3><p className={styles.description}>{t('consumptionInvitation')}</p>
          <div className={styles.bubbleCloud}>{consumptionCategories.map((category, index) => {
            const ratio = Math.sqrt(uniqueCount(category) / largestCategory);
            return <button type="button" key={category.id} className={styles.categoryBubble} data-facet-origin={category.id} aria-label={t('exploreFacet', { label: category.label })} aria-pressed={visibleCategory?.id === category.id} style={{ '--bubble-color': categoryColor(index), '--bubble-ratio': ratio, '--bubble-type': `${ratio < .59 ? 12 : ratio < .79 ? 14 : 18}px`, left: `${bubblePositions[index][0]}%`, top: `${bubblePositions[index][1]}%` } as CSSProperties} onClick={() => exploreCategory(category.id)}><strong>{category.label}</strong><span>{t('uniqueFacetWorks', { count: uniqueCount(category) })}</span></button>;
          })}</div>
          {categories.length > 0 && <label className={styles.allFacets}>{t('allConnections')}<select value={visibleCategory?.id ?? ''} onChange={event => exploreCategory(event.target.value)}>{categories.map(category => <option key={category.id} value={category.id}>{category.label} ({uniqueCount(category)})</option>)}</select></label>}
          <p className={styles.caption}>{t('bubbleAreaMeaning')}{controls.facetKind === 'genre' && <> {t('overlappingGenres')}</>}</p>
          {visibleCategory && <div className={styles.presence} aria-label={t('personConsumption')}><h4>{visibleCategory.label}</h4><div className={styles.presencePeople}>{visibleCategory.people.map(person => <div key={person.userId} style={{ '--person': personColor(snapshot, person.userId) } as CSSProperties}><div className={styles.presenceCircle}><span className={styles.consumptionBubble} data-consumption-count={person.consumed.length} style={{ width: bubbleSize(person.consumed.length), height: bubbleSize(person.consumed.length) }} aria-hidden="true"/><strong>{person.consumed.length}</strong></div><span>{name(person.userId)}</span><small>{t('consumedBase', { count: person.consumed.length, total: person.eligibleTotal })}</small></div>)}</div></div>}
          {!categories.length && <p className={styles.empty}>{t('noFacetMetadata')}</p>}
        </section>
        <section className={styles.panel} aria-label={t('preferenceTitle')}>
          <span className={styles.signal}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z"/></svg>{t('preferenceSubtitle')}</span>
          <h3>{t('preferenceTitle')}</h3><p className={styles.description}>{t('preferenceInvitation')}</p>
          {visibleCategory ? <section aria-label={visibleCategory.label} className={styles.ratedCategory}>
            <div className={styles.ratingTopic}><h4>{visibleCategory.label}</h4><small>{t('ratingScale')}</small></div>
            <div className={styles.axis} aria-hidden="true"><span>0</span><span>5</span><span>10</span></div>
            {visibleCategory.people.map(person => <div className={styles.ratingRow} key={person.userId} style={{ '--person': personColor(snapshot, person.userId) } as CSSProperties}>
              <div className={styles.ratingName}><span className={styles.avatar} aria-hidden="true">{initials(name(person.userId))}</span><span>{name(person.userId)}</span></div>
              <div className={styles.ratingTrack} aria-hidden="true">{person.mean !== null && <><span className={styles.ratingFill} style={{ width: `${person.mean * 10}%` }}/><span className={styles.ratingEnd} style={{ left: `${person.mean * 10}%` }}/></>}</div>
              <div className={styles.ratingValue}><output aria-label={t('ratedSample', { count: person.rated.length })}>{person.mean == null ? t('unrated') : person.mean.toFixed(1)}</output><small>{t('ratedSample', { count: person.rated.length })}</small></div>
              <p className={styles.ratingRange}>{person.min === null ? t('noRatingRange') : t('ratingRange', { min: person.min, max: person.max! })}</p>
            </div>)}
            <p className={styles.sample} role={visibleCategory.people.every(person => person.rated.length >= 3) ? undefined : 'status'}>{visibleCategory.people.every(person => person.rated.length >= 3) ? t('jointTrendSample') : t('insufficientTasteSample', { names: visibleCategory.people.filter(person => person.rated.length < 3).map(person => name(person.userId)).join(', ') })}</p>
          </section> : <p className={styles.empty}>{t('noFacetMetadata')}</p>}
          <p className={styles.caption}>{t('ratingMeaning')}</p>
        </section>
      </div>
      <div className={styles.coverage} aria-label={t('coverageTitle')}><h4>{t('coverageTitle')}</h4>{people.map(userId => {
        const eligible = [...new Set(snapshot.works.filter(work => work.userId === userId).map(work => work.key))];
        const covered = new Set(categories.flatMap(category => category.people.find(person => person.userId === userId)?.consumed ?? []));
        return <p key={userId}>{t('metadataCoverage', { name: name(userId), count: covered.size, total: eligible.length })}</p>;
      })}</div>
      {selected && <section className={styles.evidence}><div className={styles.evidenceHeading}><h3>{t('facetStories', { label: selected.label })}</h3><span>{t('uniqueFacetWorks', { count: keys.length })}</span></div><div className={styles.facetEvidence}>{selected.people.map(person => <section key={person.userId} aria-label={t('personEvidence', { name: name(person.userId) })} style={{ '--person': personColor(snapshot, person.userId) } as CSSProperties}><h4><span className={styles.avatar} aria-hidden="true">{initials(name(person.userId))}</span>{name(person.userId)}</h4><ul>{person.consumed.map(key => <li key={key}><EvidenceCover key={key} work={catalog.get(key)}/><span>{t('individualWorkRating', { title: title(key), rating: snapshot.works.find(work => work.userId === person.userId && work.key === key)?.rating ?? t('unrated') })}</span></li>)}</ul>{!person.consumed.length && <p>{t('noVisibleRecord')}</p>}</section>)}</div></section>}
    </div>
    {selected && <ComparisonCanvas snapshot={snapshot} view={view} onView={onView} facetKeys={keys} onOpenFacetWork={key => onOpenWork(key, { kind: 'facet', facetKind: controls.facetKind, facetId: selected.id })}/>}
  </div>;
}
