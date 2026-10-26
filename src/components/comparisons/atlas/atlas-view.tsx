'use client';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { itemHref } from '@/lib/catalog/item-href';
import cdnLoader from '@/lib/images/cdn-loader';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import { atlasModel } from '@/lib/comparisons/atlas/model';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { layoutOpinion } from '@/lib/comparisons/atlas/opinion';
import { datedYear, layoutTiempo } from '@/lib/comparisons/atlas/tiempo';
import { layoutIslands, OTHER_ISLAND, type Island, type IslandMode } from '@/lib/comparisons/atlas/islands';
import { buildScene, type Lens } from '@/lib/comparisons/atlas/scene';
import { initials } from '../presentation';
import { AtlasCanvas, type AtlasCanvasHandle } from './atlas-canvas';
import { AtlasList } from './atlas-list';
import type { AtlasHit, LensCamera } from './atlas-engine';
import { atlasKeyAction } from './atlas-keys';
import { readGroupMemory, sessionStore, writeGroupMemory } from '../atlas-ui-state';
import type { IslandText } from './paint-islas';
import { summaryMessage } from './atlas-summary-message';
import { RatingScale } from './rating-scale';
import styles from './atlas.module.css';

const TYPE_VAR = { book: 'var(--type-book)', movie: 'var(--type-movie)', series: 'var(--type-series)' } as const;
const LENS_ICONS: Record<Lens, ReactNode> = {
  quien: <><circle cx="8" cy="3" r="2"/><circle cx="3" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M7 5 4 10M9 5l3 5M5 12h6"/></>,
  opinion: <><path d="M2 14 14 2"/><path d="M2 2v12h12"/><circle cx="10" cy="5" r="1.2" fill="currentColor"/><circle cx="5" cy="10" r="1.2" fill="currentColor"/></>,
  tiempo: <><path d="M1 4h14M1 12h14"/><path d="M5 4c0 4 3 4 3 8M11 4c0 3-2 5-2 8"/></>,
  islas: <><circle cx="4" cy="9" r="3"/><circle cx="11" cy="6" r="4"/><circle cx="12.5" cy="13" r="1.8"/></>,
};
const LENSES = Object.keys(LENS_ICONS) as Lens[];
const MODES: IslandMode[] = ['type', 'genre', 'creator'];
const isType = (id: string): id is keyof typeof TYPE_VAR => Object.hasOwn(TYPE_VAR, id);

/** The work's cover through the CDN loader; without one, or if it fails to load, the type's colour block. */
function WorkCover({ work }: { work: AtlasWork }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = work.coverUrl && failed !== work.coverUrl ? work.coverUrl : null;
  return src
    // eslint-disable-next-line @next/next/no-img-element -- loader URL straight to the CDN: one small request, no /_next/image
    ? <img className={styles.cover} src={cdnLoader({ src, width: 96 })} alt="" width={38} height={56} onError={() => setFailed(src)}/>
    : <span className={styles.cover} style={{ background: TYPE_VAR[work.itemType] }} aria-hidden="true"/>;
}

/**
 * Every lens shows each owner's rating. Tiempo adds the year; Opinión also places owners on the 1–10 scale.
 * Only the active faces: a face turned off is out of the comparison, also in the card.
 */
function WorkCard({ work, people, active, title, lens }: { work: AtlasWork; people: AtlasPerson[]; active: string[]; title: string; lens: Lens }) {
  const t = useTranslations('comparisons.atlas');
  const locale = useLocale();
  const ratingFormat = new Intl.NumberFormat(locale);
  const names = new Map(people.map(person => [person.id, person]));
  const owners = work.owners.filter(owner => active.includes(owner.userId));
  const line = (name: string, date: string | null) => lens !== 'tiempo' ? name
    : date && datedYear(date) !== null ? t('years', { name, year: date.slice(0, 4) }) : t('noDate', { name });
  return <>
    <WorkCover key={work.key} work={work}/>
    <span className={styles.workInfo}><span className={styles.workTitle}>{title}</span>
      {lens === 'opinion' ? <RatingScale owners={owners} people={people}/> : <ul className={styles.owners}>{owners.map(owner => names.get(owner.userId) && <li key={owner.userId}>
        <span className={styles.ownerDot} style={{ background: names.get(owner.userId)!.color }} aria-hidden="true"/>
        <span className={styles.ownerName}>{line(names.get(owner.userId)!.name, owner.date)}</span>{' '}
        <b className={styles.ownerRating}>{owner.rating === null ? t('noRating') : t('ownerRating', { rating: ratingFormat.format(owner.rating) })}</b></li>)}</ul>}</span>
  </>;
}

/**
 * `notice` is a coverage note shown right under the summary (e.g. series without episodes).
 * The face selection is controlled by the explorer (`chosen`, null = everyone) so it survives
 * format changes, which remount this view. The lens, the Islas mode and «Ver como lista» are controlled the same way.
 * The camera is remembered per account and group (`groupId`, the explorer's, like the faces) in sessionStorage when the scene settles, and restored when the canvas mounts
 * again in the same lens (list → map, format change, back from a ficha) — only a camera the user moved: an automatic fit is forgotten, so
 * the next scene fits its own extent. Without storage the canvas fits.
 */
export function AtlasView({ snapshot, viewerId, groupId, notice, chosen, onChosenChange, lens, onLensChange, islandMode, onIslandModeChange, list, onListChange }: {
  snapshot: Snapshot; viewerId: string; groupId: string; notice?: ReactNode; chosen: string[] | null; onChosenChange: (ids: string[]) => void;
  lens: Lens; onLensChange: (lens: Lens) => void; islandMode: IslandMode; onIslandModeChange: (mode: IslandMode) => void;
  list: boolean; onListChange: (list: boolean) => void;
}) {
  const t = useTranslations('comparisons'); const locale = useLocale(); const router = useRouter();
  const you = t('you');
  const [legendOpen, setLegendOpen] = useState(false);
  const legendId = useId();
  const { people, works } = useMemo(() => atlasModel(snapshot, viewerId, you), [snapshot, viewerId, you]);
  const byKey = useMemo(() => new Map(works.map(work => [work.key, work])), [works]);
  // People order, and only people that are still in the snapshot; if none of them remains, everyone.
  // Memoized: a new array each render would re-sync (and redraw) the engine on every hover.
  const active = useMemo(() => {
    const ids = people.map(person => person.id), kept = ids.filter(id => !chosen || chosen.includes(id));
    return kept.length ? kept : ids;
  }, [people, chosen]);
  const layout = useMemo(() => layoutQuien(people, works, active), [people, works, active]);
  const opinion = useMemo(() => layoutOpinion(people, works, active), [people, works, active]);
  // Tiempo brings many lanes closer only on a wide stage, where the fit is limited by height (see `laneGap`).
  const [wide, setWide] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [insets, setInsets] = useState<{ top: number; bottom: number } | undefined>(undefined);
  const tiempo = useMemo(() => layoutTiempo(people, works, active, wide), [people, works, active, wide]);
  // Type islands only make sense across formats: with a single format, Islas groups by genre.
  const typeless = snapshot.format !== 'all';
  const effectiveMode: IslandMode = typeless && islandMode === 'type' ? 'genre' : islandMode;
  const islas = useMemo(() => layoutIslands(people, works, active, effectiveMode, viewport.width && insets ? { viewport, insets } : undefined),
    [people, works, active, effectiveMode, viewport, insets]);
  const meanFormat = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [locale]);
  const causeFormat = useMemo(() => new Intl.ListFormat(locale, { type: 'conjunction' }), [locale]);
  // Shared by the painter (titles over each island) and the summary (best island).
  const islandText = useMemo<IslandText>(() => ({
    title: (island: Island) => island.id === OTHER_ISLAND ? t('atlas.islas.other') : isType(island.id) ? t(`formats.${island.id}`) : island.label ?? '',
    common: count => t('atlas.islas.common', { count }),
    description: island => {
      const reasons = island.otherReasons;
      if (island.id !== OTHER_ISLAND || !reasons) return '';
      return causeFormat.format([
        ...(reasons.overflow ? [t('atlas.islas.otherOutside', { count: reasons.overflow })] : []),
        ...(reasons.missing ? [t(effectiveMode === 'creator' ? 'atlas.islas.otherMissingCreator' : 'atlas.islas.otherMissingGenre', { count: reasons.missing })] : []),
        ...(reasons.unsupported ? [t('atlas.islas.otherSeries', { count: reasons.unsupported })] : []),
      ]);
    },
    ratingValue: mean => meanFormat.format(mean),
    ratingLabel: (name, mean, count) => count === undefined
      ? t('atlas.islas.ratingWithoutCount', { name, mean: meanFormat.format(mean) })
      : t('atlas.islas.ratingLabel', { name, mean: meanFormat.format(mean), count }),
  }), [t, meanFormat, causeFormat, effectiveMode]);
  const layouts = useMemo(() => ({ quien: layout, opinion, tiempo, islas }), [layout, opinion, tiempo, islas]);
  const scene = useMemo(() => buildScene(lens, works, active, layouts), [lens, works, active, layouts]);
  // Corner and axis names follow the Opinión reference («Tú» unless she is out) and who it is compared with: one other
  // face is named, two or three are listed as a mean, more are counted («el resto» in the corners).
  const reference = people.find(person => person.id === opinion.reference);
  const refIsMe = String(reference?.isMe ?? true), refName = reference?.name ?? '';
  const otherNames = people.filter(person => active.includes(person.id) && person.id !== opinion.reference).map(person => person.name);
  const others = new Intl.ListFormat(locale, { type: 'conjunction' }).format(otherNames), otherCount = otherNames.length;
  const opinionLabels = useMemo(() => {
    const who = { isMe: refIsMe, ref: refName, count: otherCount, names: others, many: String(otherCount > 3) };
    return { axisRef: t('atlas.opinion.axisRef', who), axisOthers: t('atlas.opinion.axisOthers', who), loved: t('atlas.opinion.loved'),
      meh: t('atlas.opinion.meh'), refYes: t('atlas.opinion.refYes', who), othersYes: t('atlas.opinion.othersYes', who) };
  }, [t, refIsMe, refName, others, otherCount]);
  const [hover, setHover] = useState<AtlasHit | null>(null);
  const [picked, setPicked] = useState<WorkKey | null>(null);
  const camera = useRef<AtlasCanvasHandle>(null); const sheetRef = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null); const overlay = useRef<HTMLDivElement>(null); const dock = useRef<HTMLDivElement>(null);
  const stageHeight = viewport.height;
  // The camera frames the band left free by the overlays (summary + faces, lens dock), whatever their height.
  useLayoutEffect(() => {
    const measure = () => {
      const host = stage.current, top = overlay.current, bottom = dock.current; if (!host || !top || !bottom) return;
      const next = { top: Math.round(top.offsetHeight - parseFloat(getComputedStyle(top).paddingBottom || '0')), bottom: Math.round(host.clientHeight - bottom.offsetTop) };
      setInsets(current => current && current.top === next.top && current.bottom === next.bottom ? current : next);
      setViewport(current => current.width === host.clientWidth && current.height === host.clientHeight ? current : { width: host.clientWidth, height: host.clientHeight });
      setWide(host.clientWidth > host.clientHeight);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    for (const element of [stage.current, overlay.current, dock.current]) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const bold = (chunks: ReactNode) => <b>{chunks}</b>;
  // Same message for the visible summary (rich) and the canvas label (plain text, spec §7).
  const { key: summaryKey, values: summaryValues } = summaryMessage(lens, people, works, active, { opinion, islas },
    new Intl.ListFormat(locale, { type: 'conjunction' }), islandText.title);
  const canvasLabel = `${t('atlas.canvasLabel')}. ${t(`atlas.lens.${lens}`)}. ${t.markup(summaryKey, { ...summaryValues, b: chunks => chunks })}`;
  const titleOf = (work: AtlasWork) => work.metadataMissing || !work.title ? t('missingMetadata') : work.title;

  function toggle(id: string) {
    if (active.includes(id)) { if (active.length > 1) onChosenChange(active.filter(item => item !== id)); }
    else onChosenChange([...active, id]);
  }
  // A lens change can drop the hovered or picked work from the scene: start clean. Focus inside the closing sheet
  // would fall to the page, so it goes to the canvas; focus elsewhere (the dock button pressed) stays.
  function changeLens(next: Lens) {
    if (sheetRef.current?.contains(document.activeElement)) camera.current?.focus();
    setHover(null); setPicked(null); onLensChange(next);
  }
  function changeMode(next: IslandMode) { setHover(null); setPicked(null); onIslandModeChange(next); }
  function toggleList() { setHover(null); setPicked(null); onListChange(!list); }
  // Opening hands focus to the list (the keyboard path); closing leaves it on the toggle that was pressed.
  // Only an opening within this mount: a format change remounts the view with the list open and must not steal focus.
  const listRef = useRef<HTMLElement>(null); const wasList = useRef(list);
  useEffect(() => { if (list && !wasList.current) listRef.current?.focus(); wasList.current = list; }, [list]);
  // Read when the canvas (re)mounts; the engine only uses it at its first valid size, so later lens changes do not move it.
  const initialCamera = useMemo(() => {
    if (list) return undefined;
    const saved = readGroupMemory(sessionStore(), viewerId, groupId).camera;
    return saved && saved.lens === lens ? { x: saved.x, y: saved.y, k: saved.k } : undefined;
  }, [list, viewerId, groupId, lens]);
  // The probe is republished after hovers too: write only a camera that changed. A fit is not remembered (and
  // forgets the one moved before): restored, it would keep the next scene (another format, Islas mode) off its fit.
  const savedCamera = useRef('');
  function rememberCamera(next: LensCamera, own: boolean) {
    const kept = own ? next : null, value = JSON.stringify(kept); if (value === savedCamera.current) return;
    savedCamera.current = value; writeGroupMemory(sessionStore(), viewerId, groupId, { camera: kept });
  }
  /** Shortcuts while focus is inside the atlas (spec §5.3); lenses work over the list too, the camera only over the map. */
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    // Escape closes the sheet only from inside the stage: a modal elsewhere (the group sheet) handles its own.
    if (event.key === 'Escape' && picked) { event.preventDefault(); closeSheet(); return; }
    const target = event.target as HTMLElement;
    if (target.isContentEditable) return;
    const action = atlasKeyAction(event.key, { ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey }, target.tagName);
    if (!action) return;
    if (action.kind === 'lens') { event.preventDefault(); if (action.lens !== lens) changeLens(action.lens); return; }
    const handle = camera.current; if (list || !handle) return;
    event.preventDefault();
    if (action.kind === 'zoom') handle.zoomBy(action.factor);
    else if (action.kind === 'fit') handle.fit();
    else handle.panBy(action.dx, action.dy);
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
  // Closing on purpose (Escape within the stage, or «Cerrar») hands focus back to the canvas; a tap elsewhere does not.
  function closeSheet() { setPicked(null); camera.current?.focus(); }
  // On open, focus goes to «Abrir ficha» (or «Cerrar» without a link); Escape closes it (see `onKeyDown`).
  useEffect(() => { if (picked) sheetRef.current?.querySelector<HTMLElement>('a, button')?.focus(); }, [picked]);
  const unavailable = snapshot.group.members.filter(member => !member.available);
  const otherIsland = islas.islands.find(island => island.id === OTHER_ISLAND);
  const otherDescription = lens === 'islas' && !list && otherIsland ? islandText.description?.(otherIsland) : '';

  return <div ref={stage} className={styles.canvasWrap} data-comparison-stage onKeyDown={onKeyDown}>
    {list ? <AtlasList ref={listRef} lens={lens} people={people} works={works} active={active} layouts={layouts} islandText={islandText} insets={insets}/>
      : <AtlasCanvas ref={camera} label={canvasLabel} people={people} works={works} active={active} scene={scene} quien={layout} tiempo={tiempo} islas={islas} islandText={islandText} opinionLabels={opinionLabels} focusedKey={picked ?? hover?.key ?? null} insets={insets} initialCamera={initialCamera} onSettled={rememberCamera}
      countLabel={count => t('atlas.poleCount', { count })} onTogglePerson={toggle} onHover={setHover} onActivate={activate}/>}
    <div ref={overlay} className={styles.overlayTop}>
      <div><p className={styles.summary} role="status" aria-live="polite">{t.rich(summaryKey, { ...summaryValues, b: bold })}</p>
        {notice}
        {otherDescription && <p className={`${styles.summary} ${styles.listDetail}`}>{t('atlas.islas.other')}: {otherDescription}</p>}</div>
      <div className={styles.faces} role="group" aria-label={t('atlas.faces')}>
        {people.map(person => <button key={person.id} type="button" className={styles.face} aria-pressed={active.includes(person.id)}
          aria-label={person.name} style={{ '--person': person.color } as CSSProperties} onClick={() => toggle(person.id)}>
          <span className={styles.faceDot} aria-hidden="true">{initials(person.name)}</span>{person.name}</button>)}
        {unavailable.map(member => <button key={member.slotId} type="button" className={styles.face} disabled
          style={{ '--person': 'var(--atlas-faint)' } as CSSProperties}>
          <span className={styles.faceDot} aria-hidden="true">?</span>{t('unavailablePerson')}</button>)}
      </div>
    </div>
    <div ref={dock} className={styles.dock}>
      {/* One right-hand column (see CSS): the list toggle, then zoom only over the map. On phones it sits beside the lenses. */}
      <div className={styles.side}>
        <button type="button" className={styles.listToggle} aria-pressed={list} onClick={toggleList}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.5M2 8h.5M2 12h.5"/></svg>
          <span>{t('atlas.list.show')}</span></button>
        {!list && <div className={styles.zoom}>
          <button type="button" aria-label={t('atlas.zoomIn')} onClick={() => camera.current?.zoomBy(1.8)}>+</button>
          <button type="button" aria-label={t('atlas.zoomOut')} onClick={() => camera.current?.zoomBy(1 / 1.8)}>−</button>
          <button type="button" aria-label={t('atlas.zoomFit')} onClick={() => camera.current?.fit()}>⤢</button>
        </div>}
      </div>
      {lens === 'islas' && <div className={`${styles.lens} ${styles.modes}`} role="group" aria-label={t('atlas.islas.modes')}>
        {MODES.filter(mode => !typeless || mode !== 'type').map(mode => <button key={mode} type="button" aria-pressed={effectiveMode === mode}
          onClick={() => changeMode(mode)}>{t(`atlas.islas.mode.${mode}`)}</button>)}
      </div>}
      <div className={styles.lens} role="group" aria-label={t('atlas.lenses')}>
        {LENSES.map(item => <button key={item} type="button" aria-pressed={lens === item} aria-label={t(`atlas.lens.${item}`)} onClick={() => changeLens(item)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{LENS_ICONS[item]}</svg>
          <span>{t(`atlas.lens.${item}`)}</span></button>)}
      </div>
      {/* The caption explains the map; over the list it only overlapped the rows scrolling under the dock. */}
      {!list && <div className={styles.legend} data-open={legendOpen}>
        <button type="button" className={styles.legendToggle} aria-expanded={legendOpen} aria-controls={legendId}
          onClick={() => setLegendOpen(open => !open)}>
          {t('atlas.legendToggle')}
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
        </button>
        <p id={legendId} className={styles.caption}>{t(`atlas.caption.${lens}`)}</p>
      </div>}
    </div>
    {hovered && !sheet && <div className={styles.tip} aria-hidden="true"
      style={{ left: `min(${hover.x + 16}px, calc(100% - 290px))`, ...(stageHeight && hover.y > stageHeight / 2
        // Lower half: open upwards so the taller Opinión card is never cut by the bottom edge.
        ? { bottom: `calc(100% - ${hover.y - 16}px)` } : { top: `min(${hover.y + 16}px, calc(100% - 110px))` }) }}>
      <WorkCard work={hovered} people={people} active={active} title={titleOf(hovered)} lens={lens}/></div>}
    {sheet && <div ref={sheetRef} className={styles.sheet} role="dialog" aria-label={titleOf(sheet)}>
      <WorkCard work={sheet} people={people} active={active} title={titleOf(sheet)} lens={lens}/>
      <div className={styles.sheetBody}><div className={styles.sheetActions}>
        {!sheet.metadataMissing && <Link className={styles.open} href={itemHref(sheet.itemType, sheet.itemId)}>{t('atlas.openWork')}</Link>}
        <button type="button" className={styles.close} onClick={closeSheet}>{t('atlas.closeWork')}</button>
      </div></div>
    </div>}
  </div>;
}
