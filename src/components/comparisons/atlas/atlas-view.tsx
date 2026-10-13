'use client';
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { itemHref } from '@/lib/catalog/item-href';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import { atlasModel } from '@/lib/comparisons/atlas/model';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { summarizeQuien } from '@/lib/comparisons/atlas/summary';
import { initials } from '../presentation';
import { AtlasCanvas, type AtlasCanvasHandle } from './atlas-canvas';
import type { AtlasHit } from './atlas-engine';
import styles from './atlas.module.css';

const TYPE_VAR = { book: 'var(--type-book)', movie: 'var(--type-movie)', series: 'var(--type-series)' } as const;

function WorkCard({ work, people, title }: { work: AtlasWork; people: AtlasPerson[]; title: string }) {
  const names = new Map(people.map(person => [person.id, person]));
  return <>
    <span className={styles.cover} style={{ background: TYPE_VAR[work.itemType] }} aria-hidden="true"/>
    <span><span className={styles.workTitle}>{title}</span>
      <ul className={styles.owners}>{work.owners.map(owner => names.get(owner.userId) && <li key={owner.userId}>
        <span className={styles.ownerDot} style={{ background: names.get(owner.userId)!.color }} aria-hidden="true"/>
        <span>{names.get(owner.userId)!.name}</span></li>)}</ul></span>
  </>;
}

/** `notice` is a coverage note shown right under the summary (e.g. series without episodes). */
export function AtlasView({ snapshot, viewerId, notice }: { snapshot: Snapshot; viewerId: string; notice?: ReactNode }) {
  const t = useTranslations('comparisons'); const locale = useLocale(); const router = useRouter();
  const you = t('you');
  const { people, works } = useMemo(() => atlasModel(snapshot, viewerId, you), [snapshot, viewerId, you]);
  const layout = useMemo(() => layoutQuien(people, works), [people, works]);
  const byKey = useMemo(() => new Map(works.map(work => [work.key, work])), [works]);
  const [chosen, setChosen] = useState<string[]>(() => people.map(person => person.id));
  // People order, and only people that are still in the snapshot.
  const active = people.map(person => person.id).filter(id => chosen.includes(id));
  const [hover, setHover] = useState<AtlasHit | null>(null);
  const [picked, setPicked] = useState<WorkKey | null>(null);
  const camera = useRef<AtlasCanvasHandle>(null);
  const summary = summarizeQuien(people, works, active);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  const bold = (chunks: ReactNode) => <b>{chunks}</b>;
  const titleOf = (work: AtlasWork) => work.metadataMissing || !work.title ? t('missingMetadata') : work.title;

  function toggle(id: string) {
    setChosen(current => current.includes(id) ? (active.length > 1 ? current.filter(item => item !== id) : current) : [...current, id]);
  }
  function open(work: AtlasWork) { if (!work.metadataMissing) router.push(itemHref(work.itemType, work.itemId)); }
  function activate(hit: AtlasHit | null, pointerType: string) {
    if (!hit) { setPicked(null); return; }
    const work = byKey.get(hit.key); if (!work) return;
    if (pointerType === 'mouse' || picked === hit.key) { open(work); return; }
    setHover(null); setPicked(hit.key);
  }
  const hovered = hover && byKey.get(hover.key);
  const sheet = picked && byKey.get(picked);
  const unavailable = snapshot.group.members.filter(member => !member.available);

  return <div className={styles.canvasWrap} data-comparison-stage>
    <AtlasCanvas ref={camera} label={t('atlas.canvasLabel')} people={people} works={works} active={active} layout={layout}
      countLabel={count => t('atlas.poleCount', { count })} onTogglePerson={toggle} onHover={setHover} onActivate={activate}/>
    <div className={styles.overlayTop}>
      <div><p className={styles.summary} role="status" aria-live="polite">{summary.kind === 'solo'
        ? t.rich('atlas.summary.solo', { count: summary.count, name: summary.name, b: bold })
        : t.rich('atlas.summary.common', { count: summary.count, names: list.format(summary.names), b: bold })}</p>
        {notice}</div>
      <div className={styles.faces} role="group" aria-label={t('atlas.faces')}>
        {people.map(person => <button key={person.id} type="button" className={styles.face} aria-pressed={active.includes(person.id)}
          aria-label={person.name} style={{ '--person': person.color } as CSSProperties} onClick={() => toggle(person.id)}>
          <span className={styles.faceDot} aria-hidden="true">{initials(person.name)}</span>{person.name}</button>)}
        {unavailable.map(member => <button key={member.slotId} type="button" className={styles.face} disabled
          style={{ '--person': 'var(--atlas-faint)' } as CSSProperties}>
          <span className={styles.faceDot} aria-hidden="true">?</span>{t('unavailablePerson')}</button>)}
      </div>
    </div>
    <div className={styles.zoom}>
      <button type="button" aria-label={t('atlas.zoomIn')} onClick={() => camera.current?.zoomBy(1.8)}>+</button>
      <button type="button" aria-label={t('atlas.zoomOut')} onClick={() => camera.current?.zoomBy(1 / 1.8)}>−</button>
      <button type="button" aria-label={t('atlas.zoomFit')} onClick={() => camera.current?.fit()}>⤢</button>
    </div>
    <div className={styles.dock}>
      <div className={styles.lens} role="group" aria-label={t('atlas.lenses')}>
        <button type="button" aria-pressed="true" aria-label={t('atlas.lens.quien')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="8" cy="3" r="2"/><circle cx="3" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M7 5 4 10M9 5l3 5M5 12h6"/></svg>
          <span>{t('atlas.lens.quien')}</span></button>
      </div>
      <p className={styles.caption}>{t('atlas.caption.quien')}</p>
    </div>
    {hovered && !sheet && <div className={styles.tip} aria-hidden="true"
      style={{ left: `min(${hover.x + 16}px, calc(100% - 290px))`, top: `min(${hover.y + 16}px, calc(100% - 110px))` }}>
      <WorkCard work={hovered} people={people} title={titleOf(hovered)}/></div>}
    {sheet && <div className={styles.sheet} role="dialog" aria-label={titleOf(sheet)}>
      <WorkCard work={sheet} people={people} title={titleOf(sheet)}/>
      <div className={styles.sheetBody}><div className={styles.sheetActions}>
        {!sheet.metadataMissing && <Link className={styles.open} href={itemHref(sheet.itemType, sheet.itemId)}>{t('atlas.openWork')}</Link>}
        <button type="button" className={styles.close} onClick={() => setPicked(null)}>{t('atlas.closeWork')}</button>
      </div></div>
    </div>}
  </div>;
}
