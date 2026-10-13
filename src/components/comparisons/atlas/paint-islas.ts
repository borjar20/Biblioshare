import { toScreen } from '@/lib/comparisons/atlas/camera';
import type { Island, IslandsLayout } from '@/lib/comparisons/atlas/islands';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { initials } from '../presentation';
import type { PaintView } from './atlas-palette';

export type IslandText = { title: (island: Island) => string; common: (count: number) => string };
const TYPE_TINT = { book: 'book', movie: 'movie', series: 'series' } as const;

/** Island discs, gold dashed ring around the common core, title + «n en común», and a 1–10 strip with each active face's mean. */
export function paintIslasBack({ ctx, cam, vp, palette, text }: PaintView, { layout, people, text: words }: { layout: IslandsLayout; people: AtlasPerson[]; text?: IslandText }) {
  const k = cam.k;
  for (const island of layout.islands) {
    const c = toScreen(cam, vp, island), r = island.r * k;
    const tint = island.id in TYPE_TINT ? palette.type[island.id as keyof typeof TYPE_TINT] : palette.cream;
    ctx.globalAlpha = 0.1; ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (island.core > 0) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = palette.glow; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(c.x, c.y, island.core * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    if (!words) continue;
    text(words.title(island), c.x, c.y - r - 52, `800 ${Math.min(30, Math.max(14, 22 * k * 2.6))}px ${palette.font}`, palette.fg, 'center');
    text(words.common(island.common), c.x, c.y - r - 32, `600 13px ${palette.font}`, palette.glow, 'center');
    if (island.means.length) {
      const width = 120, x0 = c.x - width / 2, y = c.y - r - 14;
      ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + width, y); ctx.stroke();
      island.means.forEach(({ userId, mean }) => {
        const person = people.find(item => item.id === userId); if (!person) return;
        const x = x0 + (mean - 1) / 9 * width;
        ctx.fillStyle = person.color; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
        text(initials(person.name), x, y + 3, `800 7px ${palette.font}`, '#fff', 'center');
      });
    }
  }
}
