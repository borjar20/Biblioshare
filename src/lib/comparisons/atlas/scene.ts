import type { WorkKey } from '../types';
import { workState, type QuienLayout } from './layout';
import type { OpinionLayout } from './opinion';
import type { AtlasWork, Extent, Point } from './types';

export type Lens = 'quien' | 'opinion';
export type SceneTarget = Point & { alpha: number; glow: boolean; diff: number | null };
export type Scene = { lens: Lens; extent: Extent; targets: Map<WorkKey, SceneTarget> };

/** Where each work goes under a lens. Works a lens leaves out fade at their Quién place instead of vanishing. */
export function buildScene(lens: Lens, works: AtlasWork[], active: string[], quien: QuienLayout, opinion: OpinionLayout): Scene {
  const targets = new Map<WorkKey, SceneTarget>();
  for (const work of works) {
    const home = quien.positions.get(work.key);
    if (lens === 'quien') {
      if (!home) continue;
      const state = workState(work, active);
      targets.set(work.key, { x: home.x, y: home.y, alpha: state.alpha, glow: state.glow, diff: null });
      continue;
    }
    const point = opinion.positions.get(work.key);
    if (point) targets.set(work.key, { x: point.x, y: point.y, alpha: 1, glow: false, diff: point.diff });
    else if (home) targets.set(work.key, { x: home.x, y: home.y, alpha: 0, glow: false, diff: null });
  }
  return { lens, extent: lens === 'quien' ? quien.extent : opinion.extent, targets };
}
