'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { findings, regions } from '@/lib/comparisons/derive';
import type { CatalogWork, Finding, Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { View } from './state';
import { layoutScene, mapConnections, personCenter, regionCenter, vennCircles, WORLD_HEIGHT, WORLD_WIDTH } from './geometry';
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
  const [width, setWidth] = useState(640);
  const [pages, setPages] = useState<Record<string, number>>(() => {
    if (view.level !== 'work' || view.origin.kind !== 'region') return {};
    const origin = view.origin;
    const index = regions(snapshot, view.people).find(zone => zone.mask === origin.mask)?.keys.indexOf(view.key) ?? -1;
    return { [JSON.stringify([view.people, origin.mask, 'all'])]: Math.max(24, Math.ceil((index + 1) / 24) * 24) };
  });
  const [signal, setSignal] = useState<'all' | Finding['kind']>('all');
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
  const keys = [...new Set([...representatives, ...pageKeys, ...(view.level === 'work' ? [view.key] : [])])];
  const viewport = { width, height: 500 };
  const overview = layoutScene(snapshot, view.level === 'group' ? view : { level: 'venn', people: vennPeople }, viewport, keys);
  const scene = mask === null ? overview : layoutScene(snapshot, view, viewport, pageKeys);
  const poses = { ...overview.poses, ...scene.poses };
  const catalog = new Map(snapshot.catalog.map(work => [work.key, work]));
  const titleFor = (work: CatalogWork) => work.metadataMissing || !work.title ? t('missingMetadata') : work.title;
  function openRegion(nextMask: number) { onView({ level: 'region', people: vennPeople, mask: nextMask }); }
  function openWork(key: WorkKey) {
    const zone = zones.find(item => item.keys.includes(key));
    if (zone) onView({ level: 'work', people: vennPeople, origin: { kind: 'region', mask: zone.mask }, key });
  }
  function back() {
    if (view.level === 'work' && view.origin.kind === 'region') onView({ level: 'region', people: view.people, mask: view.origin.mask });
    else if (view.level === 'region') onView({ level: 'venn', people: view.people });
    else onView({ level: 'group' });
  }
  const isWork = view.level === 'work';
  const overviewControls = view.level === 'group' || view.level === 'venn';
  return <div ref={host} className={styles.canvas} data-view={view.level}>
    <div className={styles.toolbar}>
      {view.level !== 'group' && <button type="button" onClick={back}>{t(isWork ? 'backToRegion' : view.level === 'region' ? 'backToVenn' : 'backToGroup')}</button>}
      {view.level !== 'group' && <span>{names(vennPeople)}</span>}
      {view.level === 'group' && <><p>{t('mapHint')}</p>{members.length < snapshot.group.members.length && <p>{t('unavailableCount', { count: snapshot.group.members.length - members.length })}</p>}</>}
    </div>
    {!isWork && view.level !== 'group' && <div className={styles.signals} aria-label={t('noteFilters')}>
      {(['all', 'loved', 'similar', 'different'] as const).map(kind => <button type="button" key={kind} aria-pressed={signal === kind} onClick={() => setSignal(kind)}>{t(`signals.${kind}`)}</button>)}
    </div>}
    {view.level === 'region' && <header className={styles.regionHeading}><h3>{names(region?.people ?? [])}</h3><p>{t('baseCount', { count: region?.keys.length ?? 0 })}</p>
      {!fullKeys.length && <p>{t(signal === 'all' ? 'emptyRegion' : 'emptyFindings')}</p>}
    </header>}
    <div className={styles.stage} style={{ height: scene.height }} data-scene-height={scene.height}>
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
          const background = isWork ? key !== view.key : view.level === 'region' && !inPage;
          return <button key={key} type="button" data-work-key={key} data-background={background} className={styles.work} style={{ left: pose.x, top: pose.y, width: pose.width, height: pose.height, transform: `rotate(${pose.rotate}deg)` }}
            aria-label={t(view.level === 'venn' ? 'explorePile' : 'openWork', { title: titleFor(work) })} tabIndex={background || view.level === 'group' ? -1 : 0} aria-hidden={background || view.level === 'group'}
            onClick={() => view.level === 'venn' ? openRegion(zones.find(zone => zone.keys.includes(key))!.mask) : openWork(key)} disabled={view.level === 'group' || background}>
            <Cover work={work} title={titleFor(work)}/>
          </button>;
        })}
      </div>
      {overviewControls && <div className={styles.controls}>
        {view.level === 'group' ? <>
          {members.map((member, index) => { const point = personCenter(index, members.length); return <span key={member.slotId} className={styles.person} style={{ left: overview.camera.x + point.x * overview.camera.scale, top: point.y * overview.camera.scale }}>{member.name}</span>; })}
          <div className={styles.shared} style={{ top: 450 * overview.camera.scale + 65 }}><strong>{sharedAll.length}</strong><span>{t(members.length < snapshot.group.members.length ? 'sharedByAvailable' : 'sharedByAll')}</span></div>
        </> : zones.map(zone => { const point = regionCenter(vennPeople.length, zone.mask); return <button type="button" key={zone.mask} className={styles.region} data-empty={!zone.keys.length}
          style={{ left: overview.camera.x + point.x * overview.camera.scale, top: point.y * overview.camera.scale + (zone.keys.length ? 48 : 0) }}
          aria-label={t('openRegion', { people: names(zone.people), count: zone.keys.length })} onClick={() => openRegion(zone.mask)}><strong>{zone.keys.length}</strong><span>{names(zone.people)}</span>{signal !== 'all' && <span>{t('matchingCount', { count: matchingKeys(zone.keys, zone.people).length })}</span>}</button>; })}
      </div>}
      {isWork && catalog.has(view.key) && <WorkDetail snapshot={snapshot} view={view} work={catalog.get(view.key)!}/>}
    </div>
    {view.level === 'group' && <div className={styles.pairs} aria-label={t('pairConnections')}>{pairs.map(pair => <button type="button" key={pair.people.join(':')} onClick={() => onView({ level: 'venn', people: pair.people })}><span>{names(pair.people)}</span>{' '}<strong>{t('commonCount', { count: pair.keys.length })}</strong></button>)}</div>}
    {view.level === 'region' && <div className={styles.pagination}><p aria-live="polite">{t('renderedCount', { count: pageKeys.length, total: fullKeys.length })}</p>{limit < fullKeys.length && <button type="button" onClick={() => setPages(current => ({ ...current, [pageId]: limit + 24 }))}>{t('loadMore')}</button>}</div>}
    {!isWork && <p className={styles.caption}>{t('schematic')}</p>}
  </div>;
}
