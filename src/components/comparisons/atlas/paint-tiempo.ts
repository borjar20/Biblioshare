import { toScreen } from '@/lib/comparisons/atlas/camera';
import type { TiempoLayout } from '@/lib/comparisons/atlas/tiempo';
import { YEAR_STEP } from '@/lib/comparisons/atlas/tiempo';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { initials } from '../presentation';
import type { PaintView } from './atlas-palette';

/** Year grid, one tinted lane per active person with its avatar on the left (prototype `drawTiempoBg`). */
export function paintTiempoBack({ ctx, cam, vp, palette, text }: PaintView, { layout, people }: { layout: TiempoLayout; people: AtlasPerson[] }) {
  const k = cam.k, mid = (layout.startYear + layout.endYear) / 2;
  const top = toScreen(cam, vp, { x: 0, y: layout.extent.minY }).y, bottom = toScreen(cam, vp, { x: 0, y: layout.extent.maxY }).y;
  for (let year = layout.startYear; year <= layout.endYear; year++) {
    const x = toScreen(cam, vp, { x: (year - mid) * YEAR_STEP, y: 0 }).x;
    ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    // Labels are in screen pixels and the fit is in world units: on a narrow screen the closing year's label
    // would run past the right edge (and flipped, it would sit on the previous one). It closes the range and
    // has no column of its own, so it is left out.
    const font = `600 12px ${palette.font}`;
    if (x + 6 + measure(ctx, String(year), font) > vp.width - 4) continue;
    text(String(year), x + 6, top + 14, font, palette.faint, 'left');
  }
  const left = toScreen(cam, vp, { x: (layout.startYear - mid) * YEAR_STEP - 150, y: 0 }).x;
  const right = toScreen(cam, vp, { x: (layout.endYear - mid) * YEAR_STEP, y: 0 }).x;
  // Lanes get closer with many people (`laneGap`): band, avatar and name are sized from the screen distance
  // between lanes so none of them reaches the next lane. One placement for every lane, so names read as a column:
  // under the avatar when it fits; else on its left if the screen has room (wide screens); else under a smaller
  // avatar; and as a last resort on its right (behind the works, which are painted on top).
  const pitch = layout.gap * k, band = 170 * k * layout.gap / 230, base = Math.max(14, Math.min(26, 44 * k));
  const font = `600 12px ${palette.font}`;
  const shown = layout.lanes.flatMap(lane => { const person = people.find(item => item.id === lane.userId); return person ? [{ lane, person }] : []; });
  const widest = Math.max(0, ...shown.map(({ person }) => measure(ctx, person.name, font)));
  const fitsUnder = (radius: number) => 2 * radius + 22 <= pitch;
  const smaller = (pitch - 22) / 2;
  const [r, place]: [number, 'under' | 'left' | 'right'] = fitsUnder(base) ? [base, 'under']
    : left - base - 6 - widest >= 4 ? [Math.min(base, pitch * 0.45 - 1), 'left']
    : smaller >= 10 ? [smaller, 'under'] : [Math.max(8, Math.min(base, pitch * 0.45 - 1)), 'right'];
  for (const { lane, person } of shown) {
    const y = toScreen(cam, vp, { x: 0, y: lane.y }).y;
    ctx.globalAlpha = 0.06; ctx.fillStyle = person.color; ctx.fillRect(left + 40, y - band / 2, right - left - 40, band); ctx.globalAlpha = 1;
    ctx.fillStyle = person.color; ctx.beginPath(); ctx.arc(left, y, r, 0, Math.PI * 2); ctx.fill();
    text(initials(person.name), left, y + r * 0.2, `800 ${Math.max(7, Math.round(r * 0.58))}px ${palette.font}`, '#fff', 'center');
    // Under the avatar a long name is nudged right so it never leaves the screen.
    if (place === 'under') text(person.name, Math.max(left, measure(ctx, person.name, font) / 2 + 4), y + r + 16, font, palette.fg, 'center');
    else if (place === 'left') text(person.name, left - r - 6, y + 4, font, palette.fg, 'right');
    else text(person.name, left + r + 6, y + 4, font, palette.fg, 'left');
  }
}

function measure(ctx: CanvasRenderingContext2D, value: string, font: string) {
  ctx.font = font;
  return ctx.measureText(value).width;
}
