import type { Point } from '@/lib/comparisons/atlas/types';
import type { PaintView } from './atlas-palette';

/** Screen margin past which a thread whose whole box lies outside is not drawn. */
const MARGIN = 80;
/** Appearances at this alpha or above count as settled: their thread joins the shared stroke. */
const SETTLED = 0.98;
type Kind = 0 | 1 | 2; // 0 skipped, 1 shared cream stroke, 2 own stroke (glow or in transition)

// Scratch buffers reused across frames: one call handles ~1.000 threads and ~10.000 points, 60 times a second.
const xs: number[] = []; const ys: number[] = [];
const starts: number[] = []; const counts: number[] = []; const kinds: Kind[] = []; const alphas: number[] = []; const glows: boolean[] = [];
export type LinkAttention = { islands?: boolean; focusedKey?: string | null };

function trace(ctx: CanvasRenderingContext2D, from: number, count: number, curved: boolean) {
  ctx.moveTo(xs[from], ys[from]);
  for (let i = from + 1; i < from + count; i++) {
    if (curved) {
      const x = xs[i - 1], y = ys[i - 1], dx = xs[i] - x, dy = ys[i] - y;
      const length = Math.hypot(dx, dy), bend = Math.min(28, length * 0.12), factor = length ? bend / length : 0;
      // Perpendicular to the segment: copies on the same row still have a visible curve.
      ctx.bezierCurveTo(x + dx / 3 - dy * factor, y + dy / 3 + dx * factor,
        x + dx * 2 / 3 - dy * factor, y + dy * 2 / 3 + dx * factor, xs[i], ys[i]);
    } else {
      const my = (ys[i - 1] + ys[i]) / 2;
      ctx.bezierCurveTo(xs[i - 1], my, xs[i], my, xs[i], ys[i]);
    }
  }
}

/**
 * Bezier threads joining every appearance of the same work (Tiempo lanes, Islas categories). Threads off screen
 * are skipped (the curve stays inside the box of its ends); settled cream threads share one path and one stroke.
 */
export function paintLinks({ ctx, cam, vp, palette }: PaintView, links: string[][], positionOf: (id: string) => (Point & { a: number }) | null, glowOf: (id: string) => boolean, attention: LinkAttention = {}) {
  const hw = vp.width / 2, hh = vp.height / 2, k = cam.k;
  const curved = !!attention.islands;
  const focusing = attention.focusedKey != null;
  const focus = attention.focusedKey ? links.findIndex(ids => ids[0] === attention.focusedKey) : -1;
  let n = 0; let shared = 0;
  for (let l = 0; l < links.length; l++) {
    const ids = links[l]; const start = n;
    let minA = 1, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let j = 0; j < ids.length; j++) {
      const p = positionOf(ids[j]); if (!p || p.a <= 0.02) continue;
      const x = (p.x - cam.x) * k + hw, y = (p.y - cam.y) * k + hh;
      xs[n] = x; ys[n] = y; n++;
      if (p.a < minA) minA = p.a;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const count = n - start;
    const off = maxX < -MARGIN || minX > vp.width + MARGIN || maxY < -MARGIN || minY > vp.height + MARGIN;
    const glow = count >= 2 && !off && glowOf(ids[0]);
    const kind: Kind = count < 2 || off ? 0 : l !== focus && (focusing || !glow) && minA >= SETTLED ? 1 : 2;
    starts[l] = start; counts[l] = count; kinds[l] = kind; alphas[l] = minA; glows[l] = glow;
    if (kind === 1) shared++;
  }
  if (shared) {
    ctx.strokeStyle = palette.cream; ctx.lineWidth = 1; ctx.globalAlpha = focusing ? 0.04 : curved ? 0.12 : 0.18; ctx.beginPath();
    for (let l = 0; l < links.length; l++) if (kinds[l] === 1) trace(ctx, starts[l], counts[l], curved);
    ctx.stroke();
  }
  for (let l = 0; l < links.length; l++) {
    if (kinds[l] !== 2 || l === focus) continue; const glow = glows[l];
    ctx.strokeStyle = glow ? palette.glow : palette.cream; ctx.lineWidth = glow ? 1.6 : 1;
    ctx.globalAlpha = alphas[l] * (focusing ? 0.04 : glow ? (curved ? 0.24 : 0.55) : curved ? 0.12 : 0.18);
    ctx.beginPath(); trace(ctx, starts[l], counts[l], curved); ctx.stroke();
  }
  if (focus >= 0 && kinds[focus] !== 0) {
    ctx.strokeStyle = palette.glow; ctx.lineWidth = 2.4; ctx.globalAlpha = alphas[focus] * 0.95;
    ctx.beginPath(); trace(ctx, starts[focus], counts[focus], curved); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
}
