import type { Island, IslandsLayout } from '@/lib/comparisons/atlas/islands';
import { summarizeIslands } from '@/lib/comparisons/atlas/islands';
import type { OpinionLayout } from '@/lib/comparisons/atlas/opinion';
import { summarizeOpinion } from '@/lib/comparisons/atlas/opinion';
import type { Lens } from '@/lib/comparisons/atlas/scene';
import { summarizeQuien } from '@/lib/comparisons/atlas/summary';
import { summarizeTiempo } from '@/lib/comparisons/atlas/tiempo';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';

/** Message key (under `comparisons`) and values of the atlas summary; the same pair feeds the rich summary and the canvas label. */
export type SummaryMessage = { key: string; values: Record<string, string | number> };

/** `islandTitle` is the same naming the Islas painter uses, passed in so this stays pure (no `t`). */
export function summaryMessage(lens: Lens, people: AtlasPerson[], works: AtlasWork[], active: string[],
  layouts: { opinion: OpinionLayout; islas: IslandsLayout }, list: Intl.ListFormat, islandTitle: (island: Island) => string): SummaryMessage {
  if (lens === 'opinion') {
    const summary = summarizeOpinion(people, layouts.opinion);
    if (summary.kind === 'needsTwo') return { key: 'atlas.opinion.needsTwo', values: {} };
    if (summary.kind === 'empty') return { key: 'atlas.opinion.empty', values: { isMe: String(summary.isMe), ref: summary.ref } };
    return { key: summary.isMe ? 'atlas.opinion.counts' : 'atlas.opinion.countsWithRef',
      values: { agree: summary.agree, clash: summary.clash, total: summary.total, ref: summary.ref } };
  }
  if (lens === 'tiempo') {
    const summary = summarizeTiempo(people, works, active);
    if (summary.kind === 'lanes') return { key: 'atlas.tiempo.lanes', values: { names: list.format(summary.names) } };
    return summary.undated
      ? { key: 'atlas.tiempo.firstUndated', values: { first: summary.first, total: summary.total, undated: summary.undated } }
      : { key: 'atlas.tiempo.first', values: { first: summary.first, total: summary.total } };
  }
  if (lens === 'islas') {
    const summary = summarizeIslands(people, layouts.islas, active);
    if (summary.kind === 'solo') return { key: 'atlas.islas.solo', values: { name: summary.name } };
    if (summary.kind === 'none') return { key: 'atlas.islas.none', values: {} };
    return { key: 'atlas.islas.best', values: { label: islandTitle(summary.island), count: summary.count } };
  }
  const summary = summarizeQuien(people, works, active);
  if (summary.kind === 'solo') return { key: 'atlas.summary.solo', values: { count: summary.count, name: summary.name } };
  if (summary.names.length >= 4) return { key: 'atlas.summary.commonMany', values: { count: summary.count, people: summary.names.length } };
  return { key: 'atlas.summary.common', values: { count: summary.count, names: list.format(summary.names) } };
}
