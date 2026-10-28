import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { clusterState, poleLabelAbove, type QuienLayout } from '@/lib/comparisons/atlas/layout';
import { toScreen } from '@/lib/atlas/camera';
import { initials } from '../presentation';
import { TITLE_ZOOM, type PaintView } from './atlas-palette';

type QuienPaint = { layout: QuienLayout; active: string[]; people: AtlasPerson[]; countLabel: (count: number) => string };

/** Behind the works: threads from each owner to each labelled shared group, and the common glow. */
export function paintQuienBack({ ctx, cam, vp, palette }: PaintView, { layout, active, people }: QuienPaint) {
  const k = cam.k;
  const color = new Map(people.map(person => [person.id, person.color]));
  const poles = new Map(layout.poles.map(pole => [pole.userId, pole]));
  for (const cluster of layout.clusters) {
    const state = clusterState(cluster, active); if (!state.labelled) continue;
    const c = toScreen(cam, vp, cluster);
    for (const owner of cluster.owners) {
      const p = toScreen(cam, vp, poles.get(owner)!);
      ctx.strokeStyle = state.on ? color.get(owner)! : palette.line; ctx.globalAlpha = state.on ? 0.5 : 0.22;
      ctx.lineWidth = Math.max(1, Math.sqrt(cluster.keys.length) * 0.9);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo((p.x + c.x) / 2 * 0.9 + vp.width / 2 * 0.1, (p.y + c.y) / 2 * 0.9 + vp.height / 2 * 0.1, c.x, c.y); ctx.stroke();
    }
    if (state.common) {
      const r = cluster.r * k + 34; const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      g.addColorStop(0, 'rgba(242,194,123,.22)'); g.addColorStop(1, 'rgba(242,194,123,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Over the works: group counts at map zoom, and the people poles. */
export function paintQuienFront({ ctx, cam, vp, palette, text }: PaintView, { layout, active, people, countLabel }: QuienPaint) {
  const k = cam.k;
  if (k > 0.12 && k < TITLE_ZOOM) for (const cluster of layout.clusters) {
    const state = clusterState(cluster, active); if (!state.labelled) continue;
    const c = toScreen(cam, vp, cluster); ctx.globalAlpha = state.on ? 1 : 0.35;
    text(String(cluster.keys.length), c.x, c.y - cluster.r * k - 10, `800 ${Math.min(30, 14 + Math.sqrt(cluster.keys.length))}px ${palette.font}`,
      state.common ? palette.glow : palette.fg, 'center');
  }
  for (const pole of layout.poles) {
    const person = people.find(item => item.id === pole.userId); if (!person) continue;
    const p = toScreen(cam, vp, pole); const on = active.includes(person.id);
    ctx.globalAlpha = on ? 1 : 0.4; ctx.fillStyle = person.color; ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, Math.PI * 2); ctx.fill();
    if (on) { ctx.strokeStyle = palette.fg; ctx.lineWidth = 3; ctx.stroke(); }
    text(initials(person.name), p.x, p.y + 5, `800 15px ${palette.font}`, '#fff', 'center');
    // Away from the pole's own group (outward): below the avatar, or above it when that group hangs below.
    const above = poleLabelAbove(pole);
    text(person.name, p.x, p.y + (above ? -50 : 44), `600 13px ${palette.font}`, palette.fg, 'center');
    text(countLabel(pole.count), p.x, p.y + (above ? -35 : 59), `500 12px ${palette.font}`, palette.muted, 'center');
  }
  ctx.globalAlpha = 1;
}
