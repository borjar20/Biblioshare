'use client';
import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { itemHref } from '@/lib/catalog/item-href';
import cdnLoader from '@/lib/images/cdn-loader';
import { firstYears, listSections, type ListHeading } from '@/lib/comparisons/atlas/list';
import type { Lens, SceneLayouts } from '@/lib/comparisons/atlas/scene';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import type { IslandText } from './paint-islas';
import styles from './atlas.module.css';

const TYPE_VAR = { book: 'var(--type-book)', movie: 'var(--type-movie)', series: 'var(--type-series)' } as const;

/**
 * «Ver como lista» (spec §7): the keyboard and screen-reader way through the atlas. Same faces, format and lens
 * as the canvas it replaces; each work links to its page. Plain `<img>` with the CDN loader URL: one small request
 * per cover, never `/_next/image`.
 */
export function AtlasList({ lens, people, works, active, layouts, islandText, insets }: {
  lens: Lens; people: AtlasPerson[]; works: AtlasWork[]; active: string[]; layouts: SceneLayouts; islandText: IslandText;
  /** Same band the canvas frames: the list scrolls under the summary and the dock, never behind them at rest. */
  insets?: { top: number; bottom: number };
}) {
  const t = useTranslations('comparisons'); const locale = useLocale();
  const sections = useMemo(() => listSections(lens, works, active, layouts), [lens, works, active, layouts]);
  const byKey = useMemo(() => new Map(works.map(work => [work.key, work])), [works]);
  const names = useMemo(() => new Map(people.map(person => [person.id, person.name])), [people]);
  const years = useMemo(() => lens === 'tiempo' ? firstYears(layouts.tiempo.instances) : null, [lens, layouts.tiempo]);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  const join = (ids: string[]) => list.format(ids.flatMap(id => names.has(id) ? [names.get(id)!] : []));
  const islands = new Map(layouts.islas.islands.map(island => [island.id, island]));
  const heading = (value: ListHeading): ReactNode => value.kind === 'owners' ? join(value.ids)
    : value.kind === 'island' ? (islands.has(value.islandId) ? islandText.title(islands.get(value.islandId)!) : t('atlas.list.other')) : null;
  function detail(work: AtlasWork): string {
    if (lens === 'opinion') {
      const point = layouts.opinion.positions.get(work.key);
      return point ? t('atlas.list.diff', { ref: point.ref, others: point.others.toFixed(1) }) : '';
    }
    if (lens === 'tiempo') { const year = years?.get(work.key); return year === undefined ? '' : String(Math.floor(year)); }
    return join(work.owners.map(owner => owner.userId));
  }
  function item(work: AtlasWork) {
    const body = <>
      {work.coverUrl
        // eslint-disable-next-line @next/next/no-img-element -- loader URL straight to the CDN: one small request, no /_next/image
        ? <img className={styles.listCover} src={cdnLoader({ src: work.coverUrl, width: 96 })} alt="" loading="lazy" width={48} height={70}/>
        : <span className={styles.listCover} style={{ background: TYPE_VAR[work.itemType] }} aria-hidden="true"/>}
      <span className={styles.listText}><span className={styles.workTitle} data-title>{work.metadataMissing || !work.title ? t('missingMetadata') : work.title}</span>
        <span className={styles.listDetail}>{detail(work)}</span></span>
    </>;
    return work.metadataMissing ? <span className={styles.listItem}>{body}</span>
      : <Link className={styles.listItem} href={itemHref(work.itemType, work.itemId)}>{body}</Link>;
  }

  return <section className={styles.list} aria-label={t('atlas.list.label')} tabIndex={0}
    style={insets ? { paddingTop: insets.top, paddingBottom: insets.bottom } : undefined}>
    {sections.length === 0 ? <p className={styles.listEmpty}>{t('atlas.list.empty')}</p> : sections.map(section => <div key={section.id} className={styles.listSection}>
      {section.heading.kind !== 'plain' && <h3 className={styles.listHeading}>{heading(section.heading)}</h3>}
      <ul className={styles.listItems}>{section.keys.map(key => byKey.get(key)).map(work => work && <li key={work.key}>{item(work)}</li>)}</ul>
    </div>)}
  </section>;
}
