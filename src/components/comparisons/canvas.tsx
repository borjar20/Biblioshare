'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { findings, regions } from '@/lib/comparisons/derive';
import type { CatalogWork, Finding, Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { View } from './state';
import { groupMapLayout, layoutScene, mapConnections, personCenter, regionCenter, vennCircles, WORLD_HEIGHT, WORLD_WIDTH, type Scene } from './geometry';
import { useCamera } from './use-camera';
import { WheelGesture } from './motion';
import { WorkDetail } from './work-detail';
import { initials, personColor, personInk } from './presentation';
import styles from './canvas.module.css';

type Props = { snapshot: Snapshot; view: View; onView: (view: View) => void; facetKeys?: WorkKey[]; onOpenFacetWork?: (key: WorkKey) => void; selectedPeople?: string[]; onTogglePerson?: (id: string) => void };
function Avatar({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className={styles.avatar} aria-hidden="true">{url && !failed
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" width={53} height={53} loading="lazy" onError={() => setFailed(true)}/>
    : initials(name)}</span>;
}
function Cover({ work, title }: { work: CatalogWork; title: string }) {
  const t = useTranslations('comparisons'); const [failed, setFailed] = useState(false);
  return <><span className={styles.cover}>
    {work.coverUrl && !failed ? /* Native lazy loading keeps a reserved box and supports remote catalogue sources. */
      // eslint-disable-next-line @next/next/no-img-element
      <img src={work.coverUrl} alt="" width={120} height={174} loading="lazy" onError={() => setFailed(true)}/>
      : <span className={styles.fallback}><span>{title}</span><small>{t('noCover')}</small></span>}
  </span><span className={styles.coverTitle}>{title}</span></>;
}
type NavigationMemory = { pair: string | null; mapOrigin: 'pair' | 'selection'; region: number | null; refreshFocus: boolean };
export function ComparisonCanvas(props: Props) {
  const navigationRef = useRef<NavigationMemory>({ pair: null, mapOrigin: 'pair', region: null, refreshFocus: false });
  return <CanvasSession navigationRef={navigationRef} key={`${props.snapshot.group.id}:${props.snapshot.group.revision}:${props.snapshot.format}`} {...props}/>;
}
function CanvasSession({ snapshot, view, onView, facetKeys, onOpenFacetWork, navigationRef, selectedPeople, onTogglePerson }: Props & { navigationRef: RefObject<NavigationMemory> }) {
  const t = useTranslations('comparisons');
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const entry = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const selectionButton = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<{ key: WorkKey; scroll: number } | null>(null);
  const focusAfter = useRef<'work' | 'return' | 'back' | 'origin' | null>(null);
  useLayoutEffect(() => {
    if (navigationRef.current.refreshFocus) focusAfter.current = 'origin';
    navigationRef.current.refreshFocus = false;
    const element = host.current; const storedNavigation = navigationRef.current;
    return () => { storedNavigation.refreshFocus = !!element?.contains(document.activeElement); };
  }, [navigationRef]);
  const gesture = useRef(new WheelGesture());
  const [reduced, setReduced] = useState(false);
  const [journey, setJourney] = useState<{ level: View['level']; transition: 'group' | 'level' }>({ level: view.level, transition: 'level' });
  if (journey.level !== view.level) setJourney({ level: view.level, transition: journey.level === 'group' || view.level === 'group' ? 'group' : 'level' });
  const [width, setWidth] = useState(640);
  const [evidenceHeight, setEvidenceHeight] = useState(0);
  const [pages, setPages] = useState<Record<string, number>>(() => {
    if (view.level !== 'work' || view.origin.kind !== 'region') return {};
    const origin = view.origin;
    const index = regions(snapshot, view.people).find(zone => zone.mask === origin.mask)?.keys.indexOf(view.key) ?? -1;
    return { [JSON.stringify([view.people, origin.mask, 'all'])]: Math.max(24, Math.ceil((index + 1) / 24) * 24) };
  });
  const [signal, setSignal] = useState<'all' | Finding['kind']>('all');
  const [morePairs, setMorePairs] = useState(false);
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
  const mapLayout = groupMapLayout(members.length, width);
  const worldHeight = view.level === 'group' ? mapLayout.worldHeight : WORLD_HEIGHT;
  const names = (people: string[]) => people.map(id => members.find(member => member.userId === id)?.name ?? t('unavailablePerson')).join(', ');
  const facetMode = view.level === 'facet' || view.level === 'work' && view.origin.kind === 'facet';
  const pairs = facetMode ? [] : mapConnections(snapshot);
  const vennPeople = view.level === 'group' ? [] : view.people;
  const zones = !facetMode && vennPeople.length >= 2 && vennPeople.length <= 3 ? regions(snapshot, vennPeople) : [];
  const sharedAll = facetMode ? [] : snapshot.catalog.filter(work => members.length >= 2 && members.every(member => snapshot.works.some(row => row.userId === member.userId && row.key === work.key)))
    .toSorted((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key)).map(work => work.key);
  const connectedKeys = [...new Set(pairs.flatMap(pair => pair.keys))];
  const sampleSize = width <= 360 ? 1 : 3;
  const mapPile = connectedKeys;
  const representatives = facetMode ? [] : view.level === 'group' ? mapPile.slice(0, sampleSize)
    : zones.flatMap(zone => zone.keys.slice(0, sampleSize));
  const mask = view.level === 'region' ? view.mask : view.level === 'work' && view.origin.kind === 'region' ? view.origin.mask : null;
  const region = zones.find(zone => zone.mask === mask);
  const matchingKeys = (keys: WorkKey[], people: string[]) => {
    if (signal === 'all') return keys;
    const matches = new Set(people.length < 2 ? [] : findings(snapshot, people).filter(finding => finding.kind === signal).map(finding => finding.key));
    return keys.filter(key => matches.has(key));
  };
  const fullKeys = facetMode ? facetKeys ?? [] : region ? matchingKeys(region.keys, region.people) : [];
  const pageId = JSON.stringify([vennPeople, mask, signal]);
  const limit = pages[pageId] ?? 24;
  const pageKeys = facetMode ? fullKeys : fullKeys.slice(0, limit);
  const activeKeys = [...new Set([...representatives, ...pageKeys, ...(view.level === 'work' ? [view.key] : [])])];
  const [keys, setKeys] = useState<WorkKey[]>(activeKeys);
  if (activeKeys.some(key => !keys.includes(key))) setKeys([...new Set([...keys, ...activeKeys])]);
  const viewport = { width, height: 500 };
  const overview = layoutScene(snapshot, facetMode ? view : view.level === 'group' ? view : { level: 'venn', people: vennPeople }, viewport, keys);
  const layout = mask === null && !facetMode ? overview : layoutScene(snapshot, view, viewport, pageKeys);
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
  function openPair(people: string[], mapOrigin: NavigationMemory['mapOrigin'] = 'pair') { navigationRef.current.pair = JSON.stringify(people); navigationRef.current.mapOrigin = mapOrigin; focusAfter.current = 'back'; onView({ level: 'venn', people }); }
  function openRegion(nextMask: number) { navigationRef.current.region = nextMask; focusAfter.current = 'back'; onView({ level: 'region', people: vennPeople, mask: nextMask }); }
  function openWork(key: WorkKey) {
    if (facetMode && onOpenFacetWork && view.level === 'facet') {
      returnTo.current = { key, scroll: window.scrollY }; focusAfter.current = 'work'; onOpenFacetWork(key); return;
    }
    const zone = zones.find(item => item.keys.includes(key));
    if (zone) {
      returnTo.current = { key, scroll: window.scrollY }; focusAfter.current = 'work';
      onView({ level: 'work', people: vennPeople, origin: { kind: 'region', mask: zone.mask }, key });
    }
  }
  function back() {
    focusAfter.current = view.level === 'work' ? 'return' : 'origin';
    if (view.level === 'region') navigationRef.current.region = view.mask;
    if (view.level === 'work' && view.origin.kind === 'facet') onView({ level: 'facet', people: view.people, facetKind: view.origin.facetKind, facetId: view.origin.facetId });
    else if (view.level === 'work' && view.origin.kind === 'region') onView({ level: 'region', people: view.people, mask: view.origin.mask });
    else if (view.level === 'region') onView({ level: 'venn', people: view.people });
    else onView({ level: 'group' });
  }
  useLayoutEffect(() => {
    // The return action precedes the stage. Anchor entry at its toolbar so both
    // it and the following heading remain below the sticky shell header.
    if (view.level === 'work' && focusAfter.current === 'work') entry.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  }, [view.level]);
  useEffect(() => {
    if (moving || !focusAfter.current) return;
    if (focusAfter.current === 'return' && returnTo.current) {
      const target = Array.from(host.current?.querySelectorAll<HTMLButtonElement>('[data-work-key]') ?? []).find(node => node.dataset.workKey === returnTo.current!.key);
      target?.focus({ preventScroll: true }); window.scrollTo({ top: returnTo.current.scroll, behavior: 'instant' });
    } else {
      const controls = Array.from(host.current?.querySelectorAll<HTMLButtonElement>(view.level === 'group' ? '[data-map-pair]' : 'button[data-region-mask]:not([data-work-key])') ?? []);
      const selectionOrigin = view.level === 'group' && navigationRef.current.mapOrigin === 'selection' && !selectionButton.current?.disabled ? selectionButton.current : null;
      const origin = focusAfter.current === 'origin' ? selectionOrigin ?? controls.find(control => view.level === 'group'
        ? control.dataset.mapPair === navigationRef.current.pair : Number(control.dataset.regionMask) === navigationRef.current.region) : null;
      (origin ?? (view.level === 'group' ? controls[0] : backButton.current) ?? host.current)?.focus({ preventScroll: true });
    }
    focusAfter.current = null;
  }, [moving, view.level, navigationRef]);
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
      const canEnter = direction === 'in' && (view.level === 'venn' && !!target?.dataset.regionMask || (view.level === 'region' || view.level === 'facet') && !!target?.dataset.workKey && target.dataset.background !== 'true' || view.level === 'group' && !!target?.dataset.pair);
      const now = performance.now();
      if (!canBack && !canEnter && !gesture.current.isCaptured(now, moving)) { gesture.current.reset(); return; }
      const intent = gesture.current.push(event.deltaY, event.deltaMode, now, moving);
      if (gesture.current.captured) event.preventDefault();
      if (!intent) return;
      if (intent === 'out' && canBack) back();
      else if (view.level === 'venn' && target?.dataset.regionMask) openRegion(Number(target.dataset.regionMask));
      else if ((view.level === 'region' || view.level === 'facet') && target?.dataset.workKey) openWork(target.dataset.workKey as WorkKey);
      else if (view.level === 'group' && target?.dataset.pair) openPair(JSON.parse(target.dataset.pair) as string[]);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  });
  const isWork = view.level === 'work';
  // Async content reserves ordinary page space without changing the camera
  // destination or restarting its 720ms clock and completion focus.
  const stageHeight = isWork ? Math.max(scene.height, evidenceHeight) : scene.height;
  const overviewControls = view.level === 'group' || view.level === 'venn';
  return <div ref={host} tabIndex={-1} className={styles.canvas} data-view={view.level} data-camera-moving={moving} onKeyDown={event => { if (event.key === 'Escape' && view.level !== 'group') { event.preventDefault(); back(); } }}>
    <div ref={entry} className={styles.toolbar}>
      {view.level !== 'group' && <button ref={backButton} type="button" onClick={back}>{t(isWork ? facetMode ? 'backToFacet' : 'backToRegion' : view.level === 'region' ? 'backToVenn' : 'backToGroup')}</button>}
      {view.level !== 'group' && <span>{names(vennPeople)}</span>}
      {view.level === 'group' && <><p>{t('mapHint')}</p>{members.length < snapshot.group.members.length && <p>{t('unavailableCount', { count: snapshot.group.members.length - members.length })}</p>}</>}
      <ol className={styles.levels} aria-label={t('canvasNavigation')}>
        {(facetMode ? ['facet', 'work'] as const : ['group', 'venn', 'region', 'work'] as const).map(level => <li key={level} aria-current={view.level === level ? 'step' : undefined} data-active={view.level === level}><span>{t(`canvasLevels.${level}`)}</span></li>)}
      </ol>
    </div>
    {!facetMode && !isWork && view.level !== 'group' && <div className={styles.signals} aria-label={t('noteFilters')}>
      {(['all', 'loved', 'similar', 'different'] as const).map(kind => <button type="button" key={kind} aria-pressed={signal === kind} onClick={() => setSignal(kind)}>{t(`signals.${kind}`)}</button>)}
    </div>}
    {view.level === 'region' && <header className={styles.regionHeading}><h3>{names(region?.people ?? [])}</h3><p>{t('baseCount', { count: region?.keys.length ?? 0 })}</p>
      {!fullKeys.length && <p>{t(signal === 'all' ? 'emptyRegion' : 'emptyFindings')}</p>}
    </header>}
    <div ref={stage} className={styles.stage} style={{ height: stageHeight }} data-comparison-stage data-scene-height={stageHeight}>
      <div className={styles.world} data-comparison-world style={{ width: WORLD_WIDTH, height: worldHeight, '--camera-scale': scene.camera.scale, transform: `translate(${scene.camera.x}px, ${scene.camera.y}px) scale(${scene.camera.scale})` } as CSSProperties}>
        <svg className={styles.background} data-focused={!overviewControls} width={WORLD_WIDTH} height={worldHeight} aria-hidden="true">
          {view.level === 'group' ? pairs.map(pair => {
            const start = personCenter(members.findIndex(member => member.userId === pair.people[0]), members.length, width);
            const end = personCenter(members.findIndex(member => member.userId === pair.people[1]), members.length, width);
            const strength = pairs[0]?.keys.length ? pair.keys.length / pairs[0].keys.length : 0;
            const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
            const curve = { x: middle.x + (500 - middle.x) * .18, y: middle.y + (mapLayout.centerY - middle.y) * .18 };
            return <path key={pair.people.join(':')} d={`M ${start.x} ${start.y} Q ${curve.x} ${curve.y} ${end.x} ${end.y}`} className={styles.connection} stroke={personColor(snapshot, pair.people[0])} strokeWidth={1 + strength * 5} opacity={pair.keys.length ? .2 + strength * .3 : .08}/>;
          }) : !facetMode && vennCircles(vennPeople.length).map(({ x, y, radius }, index) => <circle key={index} cx={x} cy={y} r={radius} className={styles.vennCircle} style={{ '--person': personColor(snapshot, vennPeople[index]) } as CSSProperties} data-person={index}/>)}
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
            onClick={() => { if (view.level === 'venn') openRegion(zones.find(zone => zone.keys.includes(key))!.mask); else if (view.level === 'region' || view.level === 'facet') openWork(key); }} disabled={view.level === 'group' || background}>
            <Cover work={work} title={titleFor(work)}/>
          </button>;
        })}
      </div>
      {overviewControls && <div className={styles.controls}>
        {view.level === 'group' ? <>
          {members.map((member, index) => {
            const point = personCenter(index, members.length, width);
            const name = member.name ?? t('unavailablePerson');
            const content = <><Avatar key={member.avatarUrl} name={name} url={member.avatarUrl}/><span className={styles.personName}>{name}</span><small>{t('mapPersonCount', { count: new Set(snapshot.works.filter(work => work.userId === member.userId).map(work => work.key)).size })}</small></>;
            const style = { left: overview.camera.x + point.x * overview.camera.scale, top: point.y * overview.camera.scale, '--person': personColor(snapshot, member.userId!), '--person-ink': personInk(snapshot, member.userId!) } as CSSProperties;
            return selectedPeople && onTogglePerson ? <label key={member.slotId} className={styles.person} data-compact={width <= 300} data-selected={selectedPeople.includes(member.userId!)} style={style}><input type="checkbox" aria-label={name} checked={selectedPeople.includes(member.userId!)} onChange={() => onTogglePerson(member.userId!)}/>{content}</label>
              : <span key={member.slotId} className={styles.person} data-compact={width <= 300} style={style}>{content}</span>;
          })}
          <div className={styles.shared} data-compact={width <= 300} style={{ top: mapLayout.summaryY }}><strong>{connectedKeys.length}</strong><span>{t('connectedStories', { count: connectedKeys.length })}</span></div>
        </> : <>
          {vennPeople.map((id, index) => {
            const circle = vennCircles(vennPeople.length)[index];
            const x = vennPeople.length === 2 ? circle.x + (index ? 115 : -115) : index === 2 ? circle.x : circle.x + (index ? 115 : -115);
            const y = vennPeople.length === 2 ? circle.y - circle.radius + 32 : index === 2 ? circle.y + circle.radius + 22 : circle.y - circle.radius + 32;
            return <span key={id} className={styles.vennLabel} style={{ left: overview.camera.x + x * overview.camera.scale, top: y * overview.camera.scale, '--person': personColor(snapshot, id) } as CSSProperties}><i aria-hidden="true"/>{names([id])}</span>;
          })}
          {zones.map(zone => { const point = regionCenter(vennPeople.length, zone.mask); return <button type="button" key={zone.mask} className={styles.region} data-region-mask={zone.mask} data-empty={!zone.keys.length}
            style={{ left: overview.camera.x + point.x * overview.camera.scale + (zone.keys.length ? 25 : 0), top: point.y * overview.camera.scale + (zone.keys.length ? 30 : 0) }}
            aria-label={t('openRegion', { people: names(zone.people), count: zone.keys.length })} onClick={() => openRegion(zone.mask)}><strong>{zone.keys.length}</strong>{signal !== 'all' && <span>{t('matchingCount', { count: matchingKeys(zone.keys, zone.people).length })}</span>}</button>; })}
        </>}
      </div>}
      {isWork && catalog.has(view.key) && <WorkDetail snapshot={snapshot} view={view} work={catalog.get(view.key)!} onEvidenceHeight={setEvidenceHeight}/>}
    </div>
    {view.level === 'group' && <>
      {snapshot.group.members.some(member => !member.available || !member.userId) && <p className={styles.unavailable}>{t('unavailablePerson')}</p>}
      {selectedPeople && <div className={styles.mapFooter}><p>{t('selectPair')}</p><button ref={selectionButton} type="button" disabled={selectedPeople.length < 2 || selectedPeople.length > 3} onClick={() => openPair(selectedPeople, 'selection')}>{t('compareSelection')}</button></div>}
      <div className={styles.pairs} aria-label={t('pairConnections')}>{pairs.slice(0, 3).map(pair => <button type="button" className={styles.pairCard} data-map-pair={JSON.stringify(pair.people)} key={pair.people.join(':')} style={{ '--person': personColor(snapshot, pair.people[0]) } as CSSProperties} aria-label={`${names(pair.people)} ${t('commonCount', { count: pair.keys.length })}`} onClick={() => openPair(pair.people)}><span>{names(pair.people)}</span><strong>{t('commonCount', { count: pair.keys.length })}</strong><span className={styles.miniCovers} aria-hidden="true">{pair.keys.slice(0, 3).map(key => { const work = catalog.get(key); return work ? <span key={key}><Cover work={work} title={titleFor(work)}/></span> : null; })}</span><span className={styles.cardArrow} aria-hidden="true">↗</span></button>)}</div>
      {pairs.length > 3 && <details className={styles.morePairs} open={morePairs} onToggle={event => setMorePairs(event.currentTarget.open)}><summary>{t('mapMoreConnections', { count: pairs.length - 3 })}</summary><div className={styles.pairRows}>{pairs.slice(3).map(pair => <button type="button" data-map-pair={JSON.stringify(pair.people)} key={pair.people.join(':')} onClick={() => openPair(pair.people)}><span>{names(pair.people)}</span>{' '}<strong>{t('commonCount', { count: pair.keys.length })}</strong></button>)}</div></details>}
      {!!sharedAll.length && <section className={styles.sharedShelf}><header><h3>{t('sharedShelf')}</h3><p>{t('commonCount', { count: sharedAll.length })}</p></header><ul>{sharedAll.slice(0, 6).map(key => { const work = catalog.get(key); return work ? <li key={key}><Cover work={work} title={titleFor(work)}/></li> : null; })}</ul></section>}
    </>}
    {view.level === 'region' && <div className={styles.pagination}><p aria-live="polite">{t('renderedCount', { count: pageKeys.length, total: fullKeys.length })}</p>{limit < fullKeys.length && <button type="button" onClick={() => setPages(current => ({ ...current, [pageId]: limit + 24 }))}>{t('loadMore')}</button>}</div>}
    {!isWork && <p className={styles.caption}>{t('schematic')}</p>}
  </div>;
}
