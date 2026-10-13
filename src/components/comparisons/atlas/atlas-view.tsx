'use client';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { itemHref } from '@/lib/catalog/item-href';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import { atlasModel } from '@/lib/comparisons/atlas/model';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { layoutOpinion } from '@/lib/comparisons/atlas/opinion';
import { buildScene, type Lens } from '@/lib/comparisons/atlas/scene';
import { initials } from '../presentation';
import { AtlasCanvas, type AtlasCanvasHandle } from './atlas-canvas';
import type { AtlasHit } from './atlas-engine';
import { summaryMessage } from './atlas-summary-message';
import { RatingScale } from './rating-scale';
import styles from './atlas.module.css';

const TYPE_VAR = { book: 'var(--type-book)', movie: 'var(--type-movie)', series: 'var(--type-series)' } as const;

/** Quién lists who has the work; Opinión puts each owner on the 1–10 scale instead. */
function WorkCard({ work, people, title, lens }: { work: AtlasWork; people: AtlasPerson[]; title: string; lens: Lens }) {
  const names = new Map(people.map(person => [person.id, person]));
  return <>
    <span className={styles.cover} style={{ background: TYPE_VAR[work.itemType] }} aria-hidden="true"/>
    <span><span className={styles.workTitle}>{title}</span>
      {lens === 'opinion' ? <RatingScale owners={work.owners} people={people}/> : <ul className={styles.owners}>{work.owners.map(owner => names.get(owner.userId) && <li key={owner.userId}>
        <span className={styles.ownerDot} style={{ background: names.get(owner.userId)!.color }} aria-hidden="true"/>
        <span>{names.get(owner.userId)!.name}</span></li>)}</ul>}</span>
  </>;
}

/**
 * `notice` is a coverage note shown right under the summary (e.g. series without episodes).
 * The face selection is controlled by the explorer (`chosen`, null = everyone) so it survives
 * format changes, which remount this view. The lens is controlled the same way.
 */
export function AtlasView({ snapshot, viewerId, notice, chosen, onChosenChange, lens, onLensChange }: {
  snapshot: Snapshot; viewerId: string; notice?: ReactNode; chosen: string[] | null; onChosenChange: (ids: string[]) => void;
  lens: Lens; onLensChange: (lens: Lens) => void;
}) {
  const t = useTranslations('comparisons'); const locale = useLocale(); const router = useRouter();
  const you = t('you');
  const { people, works } = useMemo(() => atlasModel(snapshot, viewerId, you), [snapshot, viewerId, you]);
  const layout = useMemo(() => layoutQuien(people, works), [people, works]);
  const byKey = useMemo(() => new Map(works.map(work => [work.key, work])), [works]);
  // People order, and only people that are still in the snapshot; if none of them remains, everyone.
  // Memoized: a new array each render would re-sync (and redraw) the engine on every hover.
  const active = useMemo(() => {
    const ids = people.map(person => person.id), kept = ids.filter(id => !chosen || chosen.includes(id));
    return kept.length ? kept : ids;
  }, [people, chosen]);
  const opinion = useMemo(() => layoutOpinion(people, works, active), [people, works, active]);
  const scene = useMemo(() => buildScene(lens, works, active, layout, opinion), [lens, works, active, layout, opinion]);
  // Corner and axis names follow the Opinión reference («Tú» unless she is out).
  const reference = people.find(person => person.id === opinion.reference);
  const refIsMe = String(reference?.isMe ?? true), refName = reference?.name ?? '';
  const opinionLabels = useMemo(() => {
    const who = { isMe: refIsMe, ref: refName };
    return { axisRef: t('atlas.opinion.axisRef', who), axisOthers: t('atlas.opinion.axisOthers'), loved: t('atlas.opinion.loved'),
      meh: t('atlas.opinion.meh'), refYes: t('atlas.opinion.refYes', who), othersYes: t('atlas.opinion.othersYes', who) };
  }, [t, refIsMe, refName]);
  const [hover, setHover] = useState<AtlasHit | null>(null);
  const [picked, setPicked] = useState<WorkKey | null>(null);
  const camera = useRef<AtlasCanvasHandle>(null);
  const stage = useRef<HTMLDivElement>(null); const overlay = useRef<HTMLDivElement>(null); const dock = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState<{ top: number; bottom: number } | undefined>(undefined);
  const [stageHeight, setStageHeight] = useState(0);
  // The camera frames the band left free by the overlays (summary + faces, lens dock), whatever their height.
  useLayoutEffect(() => {
    const measure = () => {
      const host = stage.current, top = overlay.current, bottom = dock.current; if (!host || !top || !bottom) return;
      const next = { top: Math.round(top.offsetHeight - parseFloat(getComputedStyle(top).paddingBottom || '0')), bottom: Math.round(host.clientHeight - bottom.offsetTop) };
      setInsets(current => current && current.top === next.top && current.bottom === next.bottom ? current : next);
      setStageHeight(host.clientHeight);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    for (const element of [stage.current, overlay.current, dock.current]) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const bold = (chunks: ReactNode) => <b>{chunks}</b>;
  // Same message for the visible summary (rich) and the canvas label (plain text, spec §7).
  const { key: summaryKey, values: summaryValues } = summaryMessage(lens, people, works, active, opinion, new Intl.ListFormat(locale, { type: 'conjunction' }));
  const canvasLabel = `${t('atlas.canvasLabel')}. ${t(`atlas.lens.${lens}`)}. ${t.markup(summaryKey, { ...summaryValues, b: chunks => chunks })}`;
  const titleOf = (work: AtlasWork) => work.metadataMissing || !work.title ? t('missingMetadata') : work.title;

  function toggle(id: string) {
    if (active.includes(id)) { if (active.length > 1) onChosenChange(active.filter(item => item !== id)); }
    else onChosenChange([...active, id]);
  }
  // A lens change can drop the hovered or picked work from the scene: start clean.
  function changeLens(next: Lens) { setHover(null); setPicked(null); onLensChange(next); }
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

  return <div ref={stage} className={styles.canvasWrap} data-comparison-stage>
    <AtlasCanvas ref={camera} label={canvasLabel} people={people} works={works} active={active} scene={scene} quien={layout} opinionLabels={opinionLabels} insets={insets}
      countLabel={count => t('atlas.poleCount', { count })} onTogglePerson={toggle} onHover={setHover} onActivate={activate}/>
    <div ref={overlay} className={styles.overlayTop}>
      <div><p className={styles.summary} role="status" aria-live="polite">{t.rich(summaryKey, { ...summaryValues, b: bold })}</p>
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
    <div ref={dock} className={styles.dock}>
      <div className={styles.lens} role="group" aria-label={t('atlas.lenses')}>
        <button type="button" aria-pressed={lens === 'quien'} aria-label={t('atlas.lens.quien')} onClick={() => changeLens('quien')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="8" cy="3" r="2"/><circle cx="3" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M7 5 4 10M9 5l3 5M5 12h6"/></svg>
          <span>{t('atlas.lens.quien')}</span></button>
        <button type="button" aria-pressed={lens === 'opinion'} aria-label={t('atlas.lens.opinion')} onClick={() => changeLens('opinion')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 14 14 2"/><path d="M2 2v12h12"/><circle cx="10" cy="5" r="1.2" fill="currentColor"/><circle cx="5" cy="10" r="1.2" fill="currentColor"/></svg>
          <span>{t('atlas.lens.opinion')}</span></button>
      </div>
      <p className={styles.caption}>{t(`atlas.caption.${lens}`)}</p>
    </div>
    {hovered && !sheet && <div className={styles.tip} aria-hidden="true"
      style={{ left: `min(${hover.x + 16}px, calc(100% - 290px))`, ...(stageHeight && hover.y > stageHeight / 2
        // Lower half: open upwards so the taller Opinión card is never cut by the bottom edge.
        ? { bottom: `calc(100% - ${hover.y - 16}px)` } : { top: `min(${hover.y + 16}px, calc(100% - 110px))` }) }}>
      <WorkCard work={hovered} people={people} title={titleOf(hovered)} lens={lens}/></div>}
    {sheet && <div className={styles.sheet} role="dialog" aria-label={titleOf(sheet)}>
      <WorkCard work={sheet} people={people} title={titleOf(sheet)} lens={lens}/>
      <div className={styles.sheetBody}><div className={styles.sheetActions}>
        {!sheet.metadataMissing && <Link className={styles.open} href={itemHref(sheet.itemType, sheet.itemId)}>{t('atlas.openWork')}</Link>}
        <button type="button" className={styles.close} onClick={() => setPicked(null)}>{t('atlas.closeWork')}</button>
      </div></div>
    </div>}
  </div>;
}
