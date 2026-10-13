import type { OpinionLayout } from '@/lib/comparisons/atlas/opinion';
import { summarizeOpinion } from '@/lib/comparisons/atlas/opinion';
import type { Lens } from '@/lib/comparisons/atlas/scene';
import { summarizeQuien } from '@/lib/comparisons/atlas/summary';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';

/** Message key (under `comparisons`) and values of the atlas summary; the same pair feeds the rich summary and the canvas label. */
export type SummaryMessage = { key: string; values: Record<string, string | number> };

export function summaryMessage(lens: Lens, people: AtlasPerson[], works: AtlasWork[], active: string[], opinion: OpinionLayout,
  list: Intl.ListFormat): SummaryMessage {
  if (lens === 'opinion') {
    const summary = summarizeOpinion(people, opinion);
    if (summary.kind === 'needsTwo') return { key: 'atlas.opinion.needsTwo', values: {} };
    if (summary.kind === 'empty') return { key: 'atlas.opinion.empty', values: { isMe: String(summary.isMe), ref: summary.ref } };
    return { key: summary.isMe ? 'atlas.opinion.counts' : 'atlas.opinion.countsWithRef',
      values: { agree: summary.agree, clash: summary.clash, total: summary.total, ref: summary.ref } };
  }
  const summary = summarizeQuien(people, works, active);
  if (summary.kind === 'solo') return { key: 'atlas.summary.solo', values: { count: summary.count, name: summary.name } };
  if (summary.names.length >= 4) return { key: 'atlas.summary.commonMany', values: { count: summary.count, people: summary.names.length } };
  return { key: 'atlas.summary.common', values: { count: summary.count, names: list.format(summary.names) } };
}
