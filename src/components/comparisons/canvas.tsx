'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { findings, regions } from '@/lib/comparisons/derive';
import type { CatalogWork, Finding, Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { View } from './state';
import { layoutScene, mapConnections, personCenter, regionCenter, vennCircles, WORLD_HEIGHT, WORLD_WIDTH, type Scene } from './geometry';
import { useCamera } from './use-camera';
import { WheelGesture } from './motion';
import { WorkDetail } from './work-detail';
import styles from './canvas.module.css';

type Props = { snapshot: Snapshot; view: View; onView: (view: View) => void };
function Cover({ work, title }: { work: CatalogWork; title: string }) {
  const t = useTranslations('comparisons'); const [failed, setFailed] = useState(false);
  return <><span className={styles.cover}>
    {work.coverUrl && !failed ? /* Native lazy loading keeps a reserved box and supports remote catalogue sources. */
      // eslint-disable-next-line @next/next/no-img-element
      <img src={work.coverUrl} alt="" width={120} height={174} loading="lazy" onError={() => setFailed(true)}/>
      : <span className={styles.fallback}><span>{title}</span><small>{t('noCover')}</small></span>}
  </span><span className={styles.coverTitle}>{title}</span></>;
}
export function ComparisonCanvas(props: Props) {
  return <CanvasSession key={`${props.snapshot.group.id}:${props.snapshot.group.revision}:${props.snapshot.format}`} {...props}/>;
}
function CanvasSession({ snapshot, view, onView }: Props) {
  const t = useTranslations('comparisons');
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<{ key: WorkKey; scroll: number } | null>(null);
  const focusAfter = useRef<'work' | 'return' | 'back' | null>(null);
  const gesture = useRef(new WheelGesture());
  const [reduced, setReduced] = useState(false);
  const [journey, setJourney] = useState<{ level: View['level']; transition: 'group' | 'level' }>({ level: view.level, transition: 'level' });
  if (journey.level !== view.level) setJourney({ level: view.level, transition: journey.level === 'group' || view.level === 'group' ? 'group' : 'level' });
  const [width, setWidth] = useState(640);
  const [pages, setPages] = useState<Record<string, number>>(() => {
    if (view.level !== 'work' || view.origin.kind !== 'region') return {};
    const origin = view.origin;
    const index = regions(snapshot, view.people).find(zone => zone.mask === origin.mask)?.keys.indexOf(view.key) ?? -1;
    return { [JSON.stringify([view.people, origin.mask, 'all'])]: Math.max(24, Math.ceil((index + 1) / 24) * 24) };
  });
  const [signal, setSignal] = useState<'all' | Finding['kind']>('all');
  useLayoutEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => { if (element.clientWidth) setWidth(element.clientWidth); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const members = snapshot.group.members.filter(member => member.available && member.userId);
  const names = (people: string[]) => people.map(id => members.find(member => member.userId === id)?.name ?? t('unavailablePerson')).join(', ');
  const pairs = mapConnections(snapshot);
  const vennPeople = view.level === 'group' ? [] : view.people;
  const zones = vennPeople.length >= 2 && vennPeople.length <= 3 ? regions(snapshot, vennPeople) : [];
  const sharedAll = snapshot.catalog.filter(work => members.length >= 2 && members.every(member => snapshot.works.some(row => row.userId === member.userId && row.key === work.key)))
    .toSorted((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key)).map(work => work.key);
  const sampleSize = width <= 360 ? 1 : 3;
  const representatives = view.level === 'group' ? [...new Set([...sharedAll.slice(0, sampleSize), ...pairs.flatMap(pair => pair.keys.slice(0, sampleSize))])]
    : zones.flatMap(zone => zone.keys.slice(0, sampleSize));
  const mask = view.level === 'region' ? view.mask : view.level === 'work' && view.origin.kind === 'region' ? view.origin.mask : null;
  const region = zones.find(zone => zone.mask === mask);
  const matchingKeys = (keys: WorkKey[], people: string[]) => {
    if (signal === 'all') return keys;
    const matches = new Set(people.length < 2 ? [] : findings(snapshot, people).filter(finding => finding.kind === signal).map(finding => finding.key));
    return keys.filter(key => matches.has(key));
  };
  const fullKeys = region ? matchingKeys(region.keys, region.people) : [];
  const pageId = JSON.stringify([vennPeople, mask, signal]);
  const limit = pages[pageId] ?? 24;
  const pageKeys = fullKeys.slice(0, limit);
  const activeKeys = [...new Set([...representatives, ...pageKeys, ...(view.level === 'work' ? [view.key] : [])])];
  const [keys, setKeys] = useState<WorkKey[]>(activeKeys);
  if (activeKeys.some(key => !keys.includes(key))) setKeys([...new Set([...keys, ...activeKeys])]);
  const viewport = { width, height: 500 };
  const overview = layoutScene(snapshot, view.level === 'group' ? view : { level: 'venn', people: vennPeople }, viewport, keys);
  const layout = mask === null ? overview : layoutScene(snapshot, view, viewport, pageKeys);
  const signature = JSON.stringify({ ...layout, poses: { ...overview.poses, ...layout.poses } });
  // Detail requests rerender a child, and parent renders can recreate View.
  // Only a changed geometric destination can restart the animation.
  const [target, setTarget] = useState<{ signature: string; scene: Scene }>(() => ({ signature, scene: JSON.parse(signature) as Scene }));
  if (target.signature !== signature) setTarget({ signature, scene: JSON.parse(signature) as Scene });
  const destination = target.scene;
  const scene = useCamera(destination, journey.transition, reduced);
  const moving = scene !== destination;
  const poses = { ...destination.poses, ...scene.poses };
  const catalog = new Map(snapshot.catalog.map(work => [work.key, work]));
  const titleFor = (work: CatalogWork) => work.metadataMissing || !work.title ? t('missingMetadata') : work.title;
  function openRegion(nextMask: number) { focusAfter.current = 'back'; onView({ level: 'region', people: vennPeople, mask: nextMask }); }
  function openWork(key: WorkKey) {
    const zone = zones.find(item => item.keys.includes(key));
    if (zone) {
      returnTo.current = { key, scroll: window.scrollY }; focusAfter.current = 'work';
      onView({ level: 'work', people: vennPeople, origin: { kind: 'region', mask: zone.mask }, key });
    }
  }
  function back() {
    focusAfter.current = view.level === 'work' ? 'return' : 'back';
    if (view.level === 'work' && view.origin.kind === 'region') onView({ level: 'region', people: view.people, mask: view.origin.mask });
    else if (view.level === 'region') onView({ level: 'venn', people: view.people });
    else onView({ level: 'group' });
  }
  useLayoutEffect(() => {
    if (view.level === 'work' && focusAfter.current === 'work') stage.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  }, [view.level]);
  useEffect(() => {
    if (moving || !focusAfter.current) return;
    if (focusAfter.current === 'return' && returnTo.current) {
      const target = Array.from(host.current?.querySelectorAll<HTMLButtonElement>('[data-work-key]') ?? []).find(node => node.dataset.workKey === returnTo.current!.key);
      target?.focus({ preventScroll: true }); window.scrollTo({ top: returnTo.current.scroll, behavior: 'instant' });
    } else (backButton.current ?? host.current?.querySelector<HTMLButtonElement>('[data-map-pair]'))?.focus({ preventScroll: true });
    focusAfter.current = null;
  }, [moving, view.level]);
  // The native, non-passive listener captures only a valid destination gesture.
  // Its gesture state survives frames, so a burst cannot emit multiple levels.
  useEffect(() => {
    const element = stage.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      const direction = event.deltaY < 0 ? 'in' : event.deltaY > 0 ? 'out' : null;
      if (!direction) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-region-mask], [data-work-key], [data-pair]') : null;
      const canBack = direction === 'out' && view.level !== 'group';
      const canEnter = direction === 'in' && (view.level === 'venn' && !!target?.dataset.regionMask || view.level === 'region' && !!target?.dataset.workKey && target.dataset.background !== 'true' || view.level === 'group' && !!target?.dataset.pair);
      const now = performance.now();
      if (!canBack && !canEnter && !gesture.current.isCaptured(now, moving)) { gesture.current.reset(); return; }
      const intent = gesture.current.push(event.deltaY, event.deltaMode, now, moving);
      if (gesture.current.captured) event.preventDefault();
      if (!intent) return;
      if (intent === 'out' && canBack) back();
      else if (view.level === 'venn' && target?.dataset.regionMask) openRegion(Number(target.dataset.regionMask));
      else if (view.level === 'region' && target?.dataset.workKey) openWork(target.dataset.workKey as WorkKey);
      else if (view.level === 'group' && target?.dataset.pair) onView({ level: 'venn', people: JSON.parse(target.dataset.pair) as string[] });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  });
  const isWork = view.level === 'work';
  const overviewControls = view.level === 'group' || view.level === 'venn';
  return <div ref={host} className={styles.canvas} data-view={view.level} data-camera-moving={moving} onKeyDown={event => { if (event.key === 'Escape' && view.level !== 'group') { event.preventDefault(); back(); } }}>
    <div className={styles.toolbar}>
      {view.level !== 'group' && <button ref={backButton} type="button" onClick={back}>{t(isWork ? 'backToRegion' : view.level === 'region' ? 'backToVenn' : 'backToGroup')}</button>}
      {view.level !== 'group' && <span>{names(vennPeople)}</span>}
      {view.level === 'group' && <><p>{t('mapHint')}</p>{members.length < snapshot.group.members.length && <p>{t('unavailableCount', { count: snapshot.group.members.length - members.length })}</p>}</>}
    </div>
    {!isWork && view.level !== 'group' && <div className={styles.signals} aria-label={t('noteFilters')}>
      {(['all', 'loved', 'similar', 'different'] as const).map(kind => <button type="button" key={kind} aria-pressed={signal === kind} onClick={() => setSignal(kind)}>{t(`signals.${kind}`)}</button>)}
    </div>}
    {view.level === 'region' && <header className={styles.regionHeading}><h3>{names(region?.people ?? [])}</h3><p>{t('baseCount', { count: region?.keys.length ?? 0 })}</p>
      {!fullKeys.length && <p>{t(signal === 'all' ? 'emptyRegion' : 'emptyFindings')}</p>}
    </header>}
    <div ref={stage} className={styles.stage} style={{ height: scene.height }} data-comparison-stage data-scene-height={scene.height}>
      <div className={styles.world} data-comparison-world style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT, '--camera-scale': scene.camera.scale, transform: `translate(${scene.camera.x}px, ${scene.camera.y}px) scale(${scene.camera.scale})` } as CSSProperties}>
        <svg className={styles.background} data-focused={!overviewControls} width={WORLD_WIDTH} height={WORLD_HEIGHT} aria-hidden="true">
          {view.level === 'group' ? pairs.map(pair => {
            const start = personCenter(members.findIndex(member => member.userId === pair.people[0]), members.length);
            const end = personCenter(members.findIndex(member => member.userId === pair.people[1]), members.length);
            return <line key={pair.people.join(':')} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={styles.connection} strokeWidth={pair.keys.length ? 2 : 1}/>;
          }) : vennCircles(vennPeople.length).map(({ x, y, radius }, index) => <circle key={index} cx={x} cy={y} r={radius} className={styles.vennCircle} data-person={index}/>)}
        </svg>
        {keys.map(key => {
          const work = catalog.get(key); const pose = poses[key];
          if (!work || !pose) return null;
          const inPage = pageKeys.includes(key);
          const background = !activeKeys.includes(key) || (isWork ? key !== view.key : view.level === 'region' && !inPage);
          // A center pile belongs to everyone, not an invented first pair. It
          // has a Venn destination only when the entire group fits two/three.
          const mapPeople = view.level === 'group' ? sharedAll.includes(key)
            ? members.length <= 3 ? members.map(member => member.userId!) : undefined
            : pairs.find(pair => pair.keys.includes(key))?.people : undefined;
          return <button key={key} type="button" data-work-key={key} data-inactive={!activeKeys.includes(key)} data-pair={mapPeople && JSON.stringify(mapPeople)} data-region-mask={zones.find(zone => zone.keys.includes(key))?.mask} data-background={background} className={styles.work} style={{ left: pose.x, top: pose.y, width: pose.width, height: pose.height, transform: `rotate(${pose.rotate}deg)` }}
            aria-label={t(view.level === 'venn' ? 'explorePile' : 'openWork', { title: titleFor(work) })} tabIndex={background || view.level === 'group' ? -1 : 0} aria-hidden={background || view.level === 'group'}
            onClick={() => { if (view.level === 'venn') openRegion(zones.find(zone => zone.keys.includes(key))!.mask); else if (view.level === 'region') openWork(key); }} disabled={view.level === 'group' || background}>
            <Cover work={work} title={titleFor(work)}/>
          </button>;
        })}
      </div>
      {overviewControls && <div className={styles.controls}>
        {view.level === 'group' ? <>
          {members.map((member, index) => { const point = personCenter(index, members.length); return <span key={member.slotId} className={styles.person} style={{ left: overview.camera.x + point.x * overview.camera.scale, top: point.y * overview.camera.scale }}>{member.name}</span>; })}
          <div className={styles.shared} style={{ top: 450 * overview.camera.scale + 65 }}><strong>{sharedAll.length}</strong><span>{t(members.length < snapshot.group.members.length ? 'sharedByAvailable' : 'sharedByAll')}</span></div>
        </> : zones.map(zone => { const point = regionCenter(vennPeople.length, zone.mask); return <button type="button" key={zone.mask} className={styles.region} data-region-mask={zone.mask} data-empty={!zone.keys.length}
          style={{ left: overview.camera.x + point.x * overview.camera.scale, top: point.y * overview.camera.scale + (zone.keys.length ? 48 : 0) }}
          aria-label={t('openRegion', { people: names(zone.people), count: zone.keys.length })} onClick={() => openRegion(zone.mask)}><strong>{zone.keys.length}</strong><span>{names(zone.people)}</span>{signal !== 'all' && <span>{t('matchingCount', { count: matchingKeys(zone.keys, zone.people).length })}</span>}</button>; })}
      </div>}
      {isWork && catalog.has(view.key) && <WorkDetail snapshot={snapshot} view={view} work={catalog.get(view.key)!}/>}
    </div>
    {view.level === 'group' && <div className={styles.pairs} aria-label={t('pairConnections')}>{pairs.map(pair => <button type="button" data-map-pair key={pair.people.join(':')} onClick={() => onView({ level: 'venn', people: pair.people })}><span>{names(pair.people)}</span>{' '}<strong>{t('commonCount', { count: pair.keys.length })}</strong></button>)}</div>}
    {view.level === 'region' && <div className={styles.pagination}><p aria-live="polite">{t('renderedCount', { count: pageKeys.length, total: fullKeys.length })}</p>{limit < fullKeys.length && <button type="button" onClick={() => setPages(current => ({ ...current, [pageId]: limit + 24 }))}>{t('loadMore')}</button>}</div>}
    {!isWork && <p className={styles.caption}>{t('schematic')}</p>}
  </div>;
}
