import { toScreen } from '@/lib/comparisons/atlas/camera';
import type { Point } from '@/lib/comparisons/atlas/types';
import type { PaintView } from './atlas-palette';

/** Bezier threads joining every appearance of the same work (Tiempo lanes, Islas categories). */
export function paintLinks({ ctx, cam, vp, palette }: PaintView, links: string[][], positionOf: (id: string) => (Point & { a: number }) | null, glowOf: (id: string) => boolean) {
  for (const ids of links) {
    const points = ids.map(positionOf).filter((p): p is Point & { a: number } => !!p && p.a > 0.02).map(p => ({ ...toScreen(cam, vp, p), a: p.a }));
    if (points.length < 2) continue;
    const glow = glowOf(ids[0]);
    ctx.strokeStyle = glow ? palette.glow : palette.cream; ctx.lineWidth = glow ? 1.6 : 1;
    ctx.globalAlpha = Math.min(...points.map(p => p.a)) * (glow ? 0.55 : 0.18);
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const q = points[i - 1], p = points[i], my = (q.y + p.y) / 2;
      ctx.bezierCurveTo(q.x, my, p.x, my, p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
