'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { findings, regions } from '@/lib/comparisons/derive';
import type { CatalogWork, Finding, Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { View } from './state';
import { groupMapLayout, layoutScene, mapBackbone, mapConnections, personCenter, regionCenter, vennCircles, vennLabelPoint, WORLD_HEIGHT, WORLD_WIDTH, type Scene } from './geometry';
import { useCamera } from './use-camera';
import { morphCircle, morphLayers, regionEntry } from './morph';
import { WorkDetail } from './work-detail';
import { initials, personColor, personInk } from './presentation';
import styles from './canvas.module.css';

type Props = { snapshot: Snapshot; view: View; onView: (view: View) => void; facetKeys?: WorkKey[]; onOpenFacetWork?: (key: WorkKey) => void; selectedPeople?: string[]; onTogglePerson?: (id: string) => void; controls?: ReactNode };
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
/** Counts up once on the first map entrance; everywhere else it is just the number. */
function useCountUp(target: number, run: boolean): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!run) return;
    const start = performance.now(); let frame = 0;
    const tick = (now: number) => { const t = Math.min(1, (now - start) / 900); setShown(Math.round(target * (1 - (1 - t) ** 3))); if (t < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run]);
  return run ? shown : target;
}
type NavigationMemory = { pair: string | null; mapOrigin: 'pair' | 'selection'; region: number | null; refreshFocus: boolean; scroll: Record<string, number> };
export function ComparisonCanvas(props: Props) {
  const navigationRef = useRef<NavigationMemory>({ pair: null, mapOrigin: 'pair', region: null, refreshFocus: false, scroll: {} });
  return <CanvasSession navigationRef={navigationRef} key={`${props.snapshot.group.id}:${props.snapshot.group.revision}:${props.snapshot.format}`} {...props}/>;
}
function CanvasSession({ snapshot, view, onView, facetKeys, onOpenFacetWork, navigationRef, selectedPeople, onTogglePerson, controls }: Props & { navigationRef: RefObject<NavigationMemory> }) {
  const t = useTranslations('comparisons');
  const host = useRef<HTMLDivElement>(null);
  const entry = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const selectionButton = useRef<HTMLButtonElement>(null);
  const workEntryScroll = useRef(0);
  const returnTo = useRef<{ key: WorkKey; scroll: number } | null>(null);
  const focusAfter = useRef<'work' | 'return' | 'back' | 'origin' | null>(null);
  useLayoutEffect(() => {
    if (navigationRef.current.refreshFocus) focusAfter.current = 'origin';
    navigationRef.current.refreshFocus = false;
    const element = host.current; const storedNavigation = navigationRef.current;
    return () => { storedNavigation.refreshFocus = !!element?.contains(document.activeElement); };
  }, [navigationRef]);
  const viewId = JSON.stringify(view);
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
  // The last opened pair: the Venn grows out of its avatars and folds back into them.
  const [morphPeople, setMorphPeople] = useState<string[]>(view.level === 'venn' ? view.people : []);
  if (view.level === 'venn' && view.people.join() !== morphPeople.join()) setMorphPeople(view.people);
  const [morePairs, setMorePairs] = useState(false);
  // The map plays its entrance only when the canvas opens on it (#1498); returns use the morph.
  const [intro, setIntro] = useState(view.level === 'group');
  if (intro && view.level !== 'group') setIntro(false);
  const [highlight, setHighlight] = useState<string[] | null>(null);
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
    const measure = () => {
      if (element.clientWidth) setWidth(element.clientWidth);
      element.style.setProperty('--canvas-toolbar-height', `${(entry.current?.offsetHeight ?? 0) + 8}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(element);
    if (entry.current) observer.observe(entry.current);
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
  const sharedCount = useCountUp(connectedKeys.length, intro && !reduced && view.level === 'group');
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
  const morph = scene.morph ?? 1;
  const morphing = !facetMode && morph > 0 && morph < 1 && morphPeople.length >= 2 && morphPeople.length <= 3;
  const layers = morphLayers(morph);
  // The avatar disc sits 25.5px above its person point (110px label, 3px padding, 53px disc).
  const avatarCenter = (id: string) => { const point = personCenter(members.findIndex(member => member.userId === id), members.length, width); return { x: point.x, y: point.y - 25.5 / overview.camera.scale }; };
  const morphCircles = morphing ? morphPeople.map((id, index) => morphCircle({ ...avatarCenter(id), radius: 26.5 / overview.camera.scale }, vennCircles(morphPeople.length)[index], layers.circle)) : [];
  const shownVenn = view.level === 'venn' ? vennPeople : morphing ? morphPeople : [];
  const shownZones = view.level === 'venn' ? zones : morphing ? regions(snapshot, morphPeople) : [];
  // Hovering or focusing a person or pair lights its connections and dims the rest of the map.
  const lit = view.level === 'group' && !morphing ? highlight : null;
  const touches = (pair: { people: string[] }) => !!lit && (lit.length === 1 ? pair.people.includes(lit[0]) : lit.every(id => pair.people.includes(id)));
  const backbone = mapBackbone(pairs);
  const drawn = lit ? [...backbone, ...pairs.filter(pair => pair.keys.length && touches(pair) && !backbone.includes(pair))] : backbone;
  const litPeople = new Set(lit?.length === 1 ? [lit[0], ...pairs.filter(pair => pair.keys.length && touches(pair)).flatMap(pair => pair.people)] : lit ?? []);
  const highlightOn = (people: string[]) => ({ onPointerEnter: () => setHighlight(people), onPointerLeave: () => setHighlight(null), onFocus: () => setHighlight(people), onBlur: () => setHighlight(null) });
  const poses = { ...destination.poses, ...scene.poses };
  const catalog = new Map(snapshot.catalog.map(work => [work.key, work]));
  const titleFor = (work: CatalogWork) => work.metadataMissing || !work.title ? t('missingMetadata') : work.title;
  function rememberScroll() { navigationRef.current.scroll[viewId] = host.current?.scrollTop ?? 0; }
  function openPair(people: string[], mapOrigin: NavigationMemory['mapOrigin'] = 'pair') { setHighlight(null); rememberScroll(); navigationRef.current.pair = JSON.stringify(people); navigationRef.current.mapOrigin = mapOrigin; focusAfter.current = 'back'; onView({ level: 'venn', people }); }
  function openRegion(nextMask: number) { rememberScroll(); navigationRef.current.region = nextMask; focusAfter.current = 'back'; onView({ level: 'region', people: vennPeople, mask: nextMask }); }
  function openWork(key: WorkKey) {
    if (facetMode && onOpenFacetWork && view.level === 'facet') {
      rememberScroll();
      returnTo.current = { key, scroll: window.scrollY }; focusAfter.current = 'work'; onOpenFacetWork(key); return;
    }
    const zone = zones.find(item => item.keys.includes(key));
    if (zone) {
      rememberScroll();
      returnTo.current = { key, scroll: window.scrollY }; focusAfter.current = 'work';
      onView({ level: 'work', people: vennPeople, origin: { kind: 'region', mask: zone.mask }, key });
    }
  }
  function back() {
    rememberScroll();
    focusAfter.current = view.level === 'work' ? 'return' : 'origin';
    if (view.level === 'region') navigationRef.current.region = view.mask;
    if (view.level === 'work' && view.origin.kind === 'facet') onView({ level: 'facet', people: view.people, facetKind: view.origin.facetKind, facetId: view.origin.facetId });
    else if (view.level === 'work' && view.origin.kind === 'region') onView({ level: 'region', people: view.people, mask: view.origin.mask });
    else if (view.level === 'region') onView({ level: 'venn', people: view.people });
    else onView({ level: 'group' });
  }
  useLayoutEffect(() => {
    // Only the inner viewport moves. The page and its fixed frame stay put.
    const viewport = host.current; if (!viewport) return;
    viewport.scrollTop = 0;
    // Start the item at its return toolbar, leaving participant controls
    // reachable above it without pushing the cover and title below the frame.
    workEntryScroll.current = Math.max(0, (entry.current?.getBoundingClientRect().top ?? 0) - viewport.getBoundingClientRect().top);
    if (view.level === 'work') viewport.scrollTop = workEntryScroll.current;
  }, [viewId, view.level]);
  useEffect(() => {
    if (moving || !focusAfter.current) return;
    const viewport = host.current;
    if (viewport) viewport.scrollTop = view.level === 'work' ? workEntryScroll.current : navigationRef.current.scroll[viewId] ?? 0;
    let focused: HTMLElement | null = null;
    if (focusAfter.current === 'return' && returnTo.current) {
      const target = Array.from(host.current?.querySelectorAll<HTMLButtonElement>('[data-work-key]') ?? []).find(node => node.dataset.workKey === returnTo.current!.key);
      target?.focus({ preventScroll: true }); window.scrollTo({ top: returnTo.current.scroll, behavior: 'instant' });
      focused = target ?? null;
    } else {
      const controls = Array.from(host.current?.querySelectorAll<HTMLButtonElement>(view.level === 'group' ? '[data-map-pair]' : 'button[data-region-mask]:not([data-work-key])') ?? []);
      const selectionOrigin = view.level === 'group' && navigationRef.current.mapOrigin === 'selection' && !selectionButton.current?.disabled ? selectionButton.current : null;
      const origin = focusAfter.current === 'origin' ? selectionOrigin ?? controls.find(control => view.level === 'group'
        ? control.dataset.mapPair === navigationRef.current.pair : Number(control.dataset.regionMask) === navigationRef.current.region) : null;
      focused = origin ?? (view.level === 'group' ? controls[0] : backButton.current) ?? host.current;
      focused?.focus({ preventScroll: true });
    }
    // Native scrolling can leave the fixed frame partly behind the app header.
    // Reveal only an occluded work return button; retain the saved origin scroll.
    if (view.level === 'work' && focused === backButton.current && focused) {
      const shell = document.querySelector('header');
      const position = shell && getComputedStyle(shell).position;
      if (shell && (position === 'sticky' || position === 'fixed')) {
        const shellBottom = shell.getBoundingClientRect().bottom;
        const buttonTop = focused.getBoundingClientRect().top;
        if (shellBottom > 0 && buttonTop < shellBottom) {
          window.scrollTo({ top: window.scrollY + buttonTop - shellBottom - 12, behavior: 'instant' });
        }
      }
    }
    // A refreshed origin may have moved. Keep its focused control visible
    // without scrolling the surrounding page or hiding it behind the toolbar.
    if (viewport && focused && focused !== viewport && !entry.current?.contains(focused)) {
      const bounds = viewport.getBoundingClientRect(); const control = focused.getBoundingClientRect();
      const top = bounds.top + (entry.current?.getBoundingClientRect().height ?? 0);
      if (control.top < top) viewport.scrollTop -= top - control.top;
      else if (control.bottom > bounds.bottom) viewport.scrollTop += control.bottom - bounds.bottom;
    }
    focusAfter.current = null;
  }, [moving, viewId, view.level, navigationRef]);
  const isWork = view.level === 'work';
  // Scene height is a scrollable content extent, never the exterior frame.
  // Reserve its destination immediately instead of tweening page geometry.
  const stageHeight = isWork ? Math.max(destination.height, evidenceHeight) : destination.height;
  const overviewControls = view.level === 'group' || view.level === 'venn';
  return <div ref={host} tabIndex={-1} className={styles.canvas} data-view={view.level} data-camera-moving={moving} data-intro={intro} data-highlight={!!lit} data-canvas-scroll onKeyDown={event => { if (event.key === 'Escape' && view.level !== 'group') { event.preventDefault(); back(); } }}>
    {controls}
    <div ref={entry} className={styles.toolbar} data-canvas-toolbar>
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
    <div className={styles.stage} style={{ height: stageHeight }} data-comparison-stage data-scene-height={stageHeight}>
      <div className={styles.world} data-comparison-world style={{ width: WORLD_WIDTH, height: worldHeight, '--camera-scale': scene.camera.scale, transform: `translate(${scene.camera.x}px, ${scene.camera.y}px) scale(${scene.camera.scale})` } as CSSProperties}>
        <svg key={view.level === 'group' ? 'map' : 'scene'} className={styles.background} data-focused={!overviewControls} width={WORLD_WIDTH} height={worldHeight} aria-hidden="true">
          {(view.level === 'group' || morphing) && <g opacity={morphing ? layers.map : 1}>{drawn.map((pair, rank) => {
            const start = personCenter(members.findIndex(member => member.userId === pair.people[0]), members.length, width);
            const end = personCenter(members.findIndex(member => member.userId === pair.people[1]), members.length, width);
            const strength = pairs[0]?.keys.length ? pair.keys.length / pairs[0].keys.length : 0;
            const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
            const curve = { x: middle.x + (500 - middle.x) * .18, y: middle.y + (mapLayout.centerY - middle.y) * .18 };
            const extra = !backbone.includes(pair); const on = touches(pair);
            return <path key={pair.people.join(':')} d={`M ${start.x} ${start.y} Q ${curve.x} ${curve.y} ${end.x} ${end.y}`} pathLength={1} className={extra ? `${styles.connection} ${styles.connectionExtra}` : styles.connection} data-lit={on || undefined}
              stroke={personColor(snapshot, pair.people[0])} style={{ strokeWidth: 1 + strength * 5 + (on ? 2 : 0), opacity: lit ? on ? .9 : .05 : pair.keys.length ? .2 + strength * .3 : .08, '--draw-delay': extra ? '0ms' : `${150 + Math.min(rank, 10) * 90}ms` } as CSSProperties}/>;
          })}</g>}
          {morphing && <g data-morph={morph.toFixed(2)}>
            {morphCircles.length >= 2 && <line className={styles.morphLink} x1={morphCircles[0].x} y1={morphCircles[0].y} x2={morphCircles[1].x} y2={morphCircles[1].y} stroke={personColor(snapshot, morphPeople[0])} strokeWidth={6 / overview.camera.scale} opacity={layers.link * .45}/>}
            {morphCircles.map((circle, index) => <circle key={morphPeople[index]} cx={circle.x} cy={circle.y} r={circle.radius} className={styles.vennCircle} style={{ '--person': personColor(snapshot, morphPeople[index]), strokeOpacity: layers.circle } as CSSProperties}/>)}
          </g>}
          {!morphing && view.level !== 'group' && !facetMode && vennCircles(vennPeople.length).map(({ x, y, radius }, index) => <circle key={index} cx={x} cy={y} r={radius} className={styles.vennCircle} style={{ '--person': personColor(snapshot, vennPeople[index]) } as CSSProperties} data-person={index}/>)}
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
      {(overviewControls || morphing) && <div key={view.level === 'group' ? 'map' : 'venn'} className={styles.controls}>
        {(view.level === 'group' || morphing) && <div className={styles.layer} inert={view.level !== 'group'}>
          {members.map((member, index) => {
            const point = personCenter(index, members.length, width);
            const name = member.name ?? t('unavailablePerson');
            const count = new Set(snapshot.works.filter(work => work.userId === member.userId).map(work => work.key)).size;
            const content = <><Avatar key={member.avatarUrl} name={name} url={member.avatarUrl}/><span className={styles.personName}>{name}</span><small>{t('mapPersonCount', { count })}</small></>;
            const style = { left: overview.camera.x + point.x * overview.camera.scale, top: point.y * overview.camera.scale, '--person': personColor(snapshot, member.userId!), '--person-ink': personInk(snapshot, member.userId!), '--enter-delay': `${index * 45}ms` } as CSSProperties;
            const dimmed = !!lit && !litPeople.has(member.userId!);
            if (morphing) {
              // The pair hands over to its travelling avatars; everyone else scatters outward.
              const away = { x: point.x - 500, y: point.y - mapLayout.centerY }; const length = Math.hypot(away.x, away.y) || 1;
              const drift = layers.scatter * 70;
              Object.assign(style, { opacity: morphPeople.includes(member.userId!) ? 0 : layers.map * (count ? 1 : .5),
                transform: `translate(-50%, -50%) translate(${away.x / length * drift}px, ${away.y / length * drift}px) scale(${1 - layers.scatter * .15})` });
            }
            return selectedPeople && onTogglePerson && view.level === 'group' ? <label key={member.slotId} className={styles.person} data-compact={width <= 300} data-empty={count === 0} data-dimmed={dimmed} data-selected={selectedPeople.includes(member.userId!)} style={style} {...highlightOn([member.userId!])}><input type="checkbox" aria-label={name} checked={selectedPeople.includes(member.userId!)} onChange={() => onTogglePerson(member.userId!)}/>{content}</label>
              : <span key={member.slotId} className={styles.person} data-compact={width <= 300} data-empty={count === 0} data-dimmed={dimmed} style={style} {...(view.level === 'group' ? highlightOn([member.userId!]) : {})}>{content}</span>;
          })}
          <div className={styles.shared} data-compact={width <= 300} style={{ top: mapLayout.summaryY, opacity: morphing ? layers.map : undefined }}><strong>{sharedCount}</strong><span>{t('connectedStories', { count: connectedKeys.length })}</span></div>
        </div>}
        {(view.level === 'venn' || morphing) && <div className={styles.layer} inert={view.level !== 'venn'}>
          {shownVenn.map((id, index) => {
            const point = vennLabelPoint(shownVenn.length, index);
            const style = { left: overview.camera.x + point.x * overview.camera.scale, top: point.y * overview.camera.scale, '--person': personColor(snapshot, id) } as CSSProperties;
            if (morphing) Object.assign(style, { opacity: layers.label, transform: `translate(-50%, -50%) translateY(${(1 - layers.label) * 10}px)` });
            return <span key={id} className={styles.vennLabel} style={style}><i aria-hidden="true"/>{names([id])}</span>;
          })}
          {shownZones.map((zone, index) => {
            const point = regionCenter(shownVenn.length, zone.mask);
            const entry = morphing ? regionEntry(morph, index, zone.keys.length) : null;
            const style = { left: overview.camera.x + point.x * overview.camera.scale + (zone.keys.length ? 25 : 0), top: point.y * overview.camera.scale + (zone.keys.length ? 30 : 0) } as CSSProperties;
            if (entry) Object.assign(style, { opacity: entry.t, transform: `translate(-50%, -50%) scale(${entry.scale})` });
            const shown = <><strong>{entry ? entry.shown : zone.keys.length}</strong>{signal !== 'all' && !entry && <span>{t('matchingCount', { count: matchingKeys(zone.keys, zone.people).length })}</span>}</>;
            return view.level === 'venn' ? <button type="button" key={zone.mask} className={styles.region} data-region-mask={zone.mask} data-empty={!zone.keys.length} style={style}
              aria-label={t('openRegion', { people: names(zone.people), count: zone.keys.length })} onClick={() => openRegion(zone.mask)}>{shown}</button>
              : <span key={zone.mask} className={styles.region} data-empty={!zone.keys.length} style={style}>{shown}</span>;
          })}
        </div>}
        {morphing && morphPeople.map((id, index) => {
          const member = members.find(item => item.userId === id); if (!member) return null;
          const from = avatarCenter(id); const to = vennLabelPoint(morphPeople.length, index);
          const x = from.x + (to.x - from.x) * layers.travel; const y = from.y + (to.y - from.y) * layers.travel;
          return <span key={id} className={styles.traveller} aria-hidden="true" style={{ left: overview.camera.x + x * overview.camera.scale, top: y * overview.camera.scale, opacity: layers.avatar,
            transform: `translate(-50%, -50%) scale(${1 - layers.travel * .7})`, '--person': personColor(snapshot, id), '--person-ink': personInk(snapshot, id) } as CSSProperties}>
            <Avatar name={member.name ?? t('unavailablePerson')} url={member.avatarUrl}/></span>;
        })}
      </div>}
      {isWork && catalog.has(view.key) && <WorkDetail snapshot={snapshot} view={view} work={catalog.get(view.key)!} onEvidenceHeight={setEvidenceHeight}/>}
    </div>
    {view.level === 'group' && <>
      {snapshot.group.members.some(member => !member.available || !member.userId) && <p className={styles.unavailable}>{t('unavailablePerson')}</p>}
      {selectedPeople && <div className={styles.mapFooter}><p>{t('selectPair')}</p><button ref={selectionButton} type="button" disabled={selectedPeople.length < 2 || selectedPeople.length > 3} onClick={() => openPair(selectedPeople, 'selection')}>{t('compareSelection')}</button></div>}
      <div className={styles.pairs} aria-label={t('pairConnections')}>{pairs.slice(0, 3).map((pair, index) => <button type="button" className={styles.pairCard} data-map-pair={JSON.stringify(pair.people)} key={pair.people.join(':')} style={{ '--person': personColor(snapshot, pair.people[0]), '--enter-delay': `${450 + index * 80}ms` } as CSSProperties} {...highlightOn(pair.people)} aria-label={`${names(pair.people)} ${t('commonCount', { count: pair.keys.length })}`} onClick={() => openPair(pair.people)}><span>{names(pair.people)}</span><strong>{t('commonCount', { count: pair.keys.length })}</strong><span className={styles.miniCovers} aria-hidden="true">{pair.keys.slice(0, 3).map(key => { const work = catalog.get(key); return work ? <span key={key}><Cover work={work} title={titleFor(work)}/></span> : null; })}</span><span className={styles.cardArrow} aria-hidden="true">↗</span></button>)}</div>
      {pairs.length > 3 && <details className={styles.morePairs} open={morePairs} onToggle={event => setMorePairs(event.currentTarget.open)}><summary>{t('mapMoreConnections', { count: pairs.length - 3 })}</summary><div className={styles.pairRows}>{pairs.slice(3).map(pair => <button type="button" data-map-pair={JSON.stringify(pair.people)} key={pair.people.join(':')} {...highlightOn(pair.people)} onClick={() => openPair(pair.people)}><span>{names(pair.people)}</span>{' '}<strong>{t('commonCount', { count: pair.keys.length })}</strong></button>)}</div></details>}
      {!!sharedAll.length && <section className={styles.sharedShelf}><header><h3>{t('sharedShelf')}</h3><p>{t('commonCount', { count: sharedAll.length })}</p></header><ul>{sharedAll.slice(0, 6).map(key => { const work = catalog.get(key); return work ? <li key={key}><Cover work={work} title={titleFor(work)}/></li> : null; })}</ul></section>}
    </>}
    {view.level === 'region' && <div className={styles.pagination}><p aria-live="polite">{t('renderedCount', { count: pageKeys.length, total: fullKeys.length })}</p>{limit < fullKeys.length && <button type="button" onClick={() => setPages(current => ({ ...current, [pageId]: limit + 24 }))}>{t('loadMore')}</button>}</div>}
    {!isWork && <p className={styles.caption}>{t('schematic')}</p>}
  </div>;
}
