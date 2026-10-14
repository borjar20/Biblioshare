import { toScreen } from '@/lib/comparisons/atlas/camera';
import { islandHeaderGeometry, ISLAND_HEADER_WIDTH, ISLAND_TITLE_MAX_PX, type Island, type IslandsLayout } from '@/lib/comparisons/atlas/islands';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { initials } from '../presentation';
import type { PaintView } from './atlas-palette';

export type IslandText = { title: (island: Island) => string; common: (count: number) => string;
  description?: (island: Island) => string;
  ratingValue?: (mean: number) => string;
  ratingLabel?: (name: string, mean: number, count?: number) => string };
const TYPE_TINT = { book: 'book', movie: 'movie', series: 'series' } as const;
const STRIP_WIDTH = 132, BADGE_WIDTH = 44, BADGE_COLUMNS = 3, BADGE_STEP = 16;
const RAIL_GAP = 18, BADGE_GAP = 29, BADGE_RADIUS = 7;
const FALLBACK_VALUE = new Intl.NumberFormat('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Values use a compact three-column legend rather than hiding faces behind «+n». The precise positions stay
 * on the rail: near means get separate 2px marker lanes, while every face keeps a readable decimal in the
 * legend. Ten coinciding faces therefore use four badge rows, never ten full-height rows.
 */
function ratingGeometry(island: Island, people: AtlasPerson[]) {
  const placed: { person: AtlasPerson; mean: number; x: number; level: number }[] = [];
  for (const { userId, mean } of island.means) {
    const person = people.find(item => item.id === userId); if (!person) continue;
    const x = (Math.min(10, Math.max(1, mean)) - 1) / 9 * STRIP_WIDTH;
    let level = 0;
    while (placed.some(dot => dot.level === level && Math.abs(dot.x - x) < 4)) level++;
    placed.push({ person, mean, x, level });
  }
  const { rows, commonGap, titleGap } = islandHeaderGeometry(placed.length);
  return { placed, rows, commonGap, titleGap };
}

/**
 * Screen px the painter draws above the highest disc (title + «n en común» + mean badges + rail).
 * These texts keep their pixel size at any zoom, so a world margin in the extent cannot hold them: on a narrow
 * phone the fit zooms out and a world margin shrinks below them. The engine adds this to the top inset instead.
 */
export function islandLabelRoom(layout: IslandsLayout, people: AtlasPerson[]): number {
  if (!layout.islands.length) return 0;
  return Math.max(...layout.islands.map(island => ratingGeometry(island, people).titleGap)) + ISLAND_TITLE_MAX_PX;
}

/** A title owns one fixed-width column; its full name remains in the list. */
function boundedTitle(ctx: CanvasRenderingContext2D, value: string, font: string, width: number): string {
  ctx.font = font;
  if (width < ctx.measureText('…').width) return '';
  if (ctx.measureText(value).width <= width) return value;
  let cut = value;
  while (cut.length > 0 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
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
    if (!words || (layout.framing && k < layout.framing.titleZoom)) continue;
    const width = STRIP_WIDTH, x0 = c.x - width / 2, y = c.y - r - RAIL_GAP;
    const summary = !layout.framing || k >= layout.framing.summaryZoom;
    const ratings = !layout.framing || k >= layout.framing.ratingZoom;
    const { placed, rows } = ratings ? ratingGeometry(island, people) : { placed: [], rows: 0 };
    const { commonGap, titleGap } = islandHeaderGeometry(placed.length, summary);
    const titleFont = `800 ${Math.min(ISLAND_TITLE_MAX_PX, Math.max(14, 22 * k * 2.6))}px ${palette.font}`;
    const titleWidth = ISLAND_HEADER_WIDTH * (layout.framing ? Math.min(1, k / layout.framing.camera.k) : 1);
    const title = boundedTitle(ctx, words.title(island), titleFont, titleWidth);
    if (title) text(title, c.x, c.y - r - titleGap, titleFont, palette.fg, 'center');
    if (summary) text(words.common(island.common), c.x, c.y - r - commonGap, `600 13px ${palette.font}`, palette.glow, 'center');
    if (placed.length) {
      ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + width, y); ctx.stroke();
      for (let tick = 1; tick <= 10; tick++) {
        const tx = x0 + (tick - 1) / 9 * width;
        ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y + (tick === 1 || tick === 5 || tick === 10 ? 4 : 2)); ctx.stroke();
        if (tick === 1 || tick === 5 || tick === 10) text(String(tick), tx, y + 14, `600 11px ${palette.font}`, palette.muted, 'center');
      }
      placed.forEach((dot, index) => {
        ctx.fillStyle = dot.person.color; ctx.beginPath(); ctx.arc(x0 + dot.x, y - dot.level * 2, 1.5, 0, Math.PI * 2); ctx.fill();
        const row = Math.floor(index / BADGE_COLUMNS), column = index % BADGE_COLUMNS;
        const columns = Math.min(BADGE_COLUMNS, placed.length - row * BADGE_COLUMNS);
        const bx = c.x - columns * BADGE_WIDTH / 2 + column * BADGE_WIDTH + BADGE_RADIUS;
        const by = y - BADGE_GAP - (rows - row - 1) * BADGE_STEP;
        ctx.beginPath(); ctx.arc(bx, by, BADGE_RADIUS, 0, Math.PI * 2); ctx.fill();
        text(initials(dot.person.name), bx, by + 2.5, `800 7px ${palette.font}`, '#fff', 'center');
        text(words.ratingValue?.(dot.mean) ?? FALLBACK_VALUE.format(dot.mean), bx + BADGE_RADIUS + 3, by + 4, `700 11px ${palette.font}`, palette.fg, 'left');
      });
    }
  }
}
