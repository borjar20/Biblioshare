import { toScreen } from '@/lib/comparisons/atlas/camera';
import type { Island, IslandsLayout } from '@/lib/comparisons/atlas/islands';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { initials } from '../presentation';
import type { PaintView } from './atlas-palette';

export type IslandText = { title: (island: Island) => string; common: (count: number) => string };
const TYPE_TINT = { book: 'book', movie: 'movie', series: 'series' } as const;
const STACK_MAX = 4;
/** Screen px from a disc's top edge up to the title baseline and «n en común» baseline, before the stack lifts them. */
const TITLE_GAP = 52, COMMON_GAP = 32;
/** Largest title font (px); the fit reserves it whole, since the font size follows the zoom the fit is choosing. */
const TITLE_MAX_PX = 30;
const STRIP_WIDTH = 120;

/**
 * Faces with the same mean (to 0.1) stack upwards, 14 px per level as in the RatingScale. Dots are 14 px wide,
 * so close but different means (8.9 and 9.0) would still cover each other: each dot takes the lowest level
 * free of any dot less than 14 px away. Positions are screen px along the strip (0…STRIP_WIDTH), so they do
 * not depend on the camera. `lift` is how far the texts rise with the (at most STACK_MAX high) stack.
 */
function placeFaces(island: Island, people: AtlasPerson[]) {
  const placed: { person: AtlasPerson; x: number; level: number }[] = [];
  for (const { userId, mean } of island.means) {
    const person = people.find(item => item.id === userId); if (!person) continue;
    const x = (Math.round(mean * 10) / 10 - 1) / 9 * STRIP_WIDTH;
    let level = 0;
    while (placed.some(dot => dot.level === level && Math.abs(dot.x - x) < 14)) level++;
    placed.push({ person, x, level });
  }
  const lift = Math.max(0, ...placed.map(dot => Math.min(dot.level, STACK_MAX - 1))) * 14;
  return { placed, lift };
}

/**
 * Screen px the painter draws above the highest disc (title + «n en común» + means strip, risen with the stack).
 * These texts keep their pixel size at any zoom, so a world margin in the extent cannot hold them: on a narrow
 * phone the fit zooms out and a world margin shrinks below them. The engine adds this to the top inset instead.
 */
export function islandLabelRoom(layout: IslandsLayout, people: AtlasPerson[]): number {
  if (!layout.islands.length) return 0;
  return TITLE_GAP + TITLE_MAX_PX + Math.max(...layout.islands.map(island => placeFaces(island, people).lift));
}

/** Island discs, gold dashed ring around the common core, title + «n en común», and a 1–10 strip with each active face's mean. */
export function paintIslasBack({ ctx, cam, vp, palette, text }: PaintView, { layout, people, text: words }: { layout: IslandsLayout; people: AtlasPerson[]; text?: IslandText }) {
  const k = cam.k;
  for (const island of layout.islands) {
    const c = toScreen(cam, vp, island), r = island.r * k;
    const tint = island.id in TYPE_TINT ? palette.type[island.id as keyof typeof TYPE_TINT] : palette.cream;
    ctx.globalAlpha = 0.1; ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (island.core > 0) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = palette.glow; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(c.x, c.y, island.core * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; ctx.globalAlpha = 1;
    }
    if (!words) continue;
    // A stack is at most 4 high (10 equal faces would push the title off screen): from the 4th up, a column's
    // extra faces fold into one «+n» dot. The texts rise with the stack.
    const width = STRIP_WIDTH, x0 = c.x - width / 2, y = c.y - r - 14;
    const { placed: local, lift } = placeFaces(island, people);
    const placed = local.map(dot => ({ ...dot, x: x0 + dot.x }));
    const dots = placed.filter(dot => dot.level < STACK_MAX - 1);
    const folds: { x: number; people: AtlasPerson[] }[] = [];
    for (const dot of placed.filter(item => item.level >= STACK_MAX - 1)) {
      const fold = folds.find(item => Math.abs(item.x - dot.x) < 14);
      if (fold) fold.people.push(dot.person); else folds.push({ x: dot.x, people: [dot.person] });
    }
    text(words.title(island), c.x, c.y - r - TITLE_GAP - lift, `800 ${Math.min(TITLE_MAX_PX, Math.max(14, 22 * k * 2.6))}px ${palette.font}`, palette.fg, 'center');
    text(words.common(island.common), c.x, c.y - r - COMMON_GAP - lift, `600 13px ${palette.font}`, palette.glow, 'center');
    if (island.means.length) {
      ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + width, y); ctx.stroke();
      const face = (x: number, level: number, color: string, label: string) => {
        const dy = y - level * 14;
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, dy, 7, 0, Math.PI * 2); ctx.fill();
        text(label, x, dy + 3, `800 7px ${palette.font}`, '#fff', 'center');
      };
      for (const dot of dots) face(dot.x, dot.level, dot.person.color, initials(dot.person.name));
      for (const fold of folds) {
        if (fold.people.length === 1) face(fold.x, STACK_MAX - 1, fold.people[0].color, initials(fold.people[0].name));
        else face(fold.x, STACK_MAX - 1, palette.muted, `+${fold.people.length}`);
      }
    }
  }
}
