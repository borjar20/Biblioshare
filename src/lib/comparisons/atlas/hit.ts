import type { Point } from './types';

export function nearest<T extends Point>(items: Iterable<T>, p: Point, radius: number): T | null {
  let best: T | null = null; let distance = radius;
  for (const item of items) {
    const d = Math.hypot(item.x - p.x, item.y - p.y);
    if (d <= distance) { distance = d; best = item; }
  }
  return best;
}
