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
    // Labels are in screen pixels and the fit is in world units: on a narrow screen the last year's label
    // would run past the right edge, so it flips to the left of its line.
    const font = `600 12px ${palette.font}`, flip = x + 6 + measure(ctx, String(year), font) > vp.width - 4;
    text(String(year), flip ? x - 6 : x + 6, top + 14, font, palette.faint, flip ? 'right' : 'left');
  }
  const left = toScreen(cam, vp, { x: (layout.startYear - mid) * YEAR_STEP - 150, y: 0 }).x;
  const right = toScreen(cam, vp, { x: (layout.endYear - mid) * YEAR_STEP, y: 0 }).x;
  for (const lane of layout.lanes) {
    const person = people.find(item => item.id === lane.userId); if (!person) continue;
    const y = toScreen(cam, vp, { x: 0, y: lane.y }).y, band = 170 * k;
    ctx.globalAlpha = 0.06; ctx.fillStyle = person.color; ctx.fillRect(left + 40, y - band / 2, right - left - 40, band); ctx.globalAlpha = 1;
    const r = Math.max(14, Math.min(26, 44 * k));
    ctx.fillStyle = person.color; ctx.beginPath(); ctx.arc(left, y, r, 0, Math.PI * 2); ctx.fill();
    text(initials(person.name), left, y + r * 0.2, `800 ${Math.round(r * 0.58)}px ${palette.font}`, '#fff', 'center');
    // Same with a long name centred under the avatar: it is nudged right so it never leaves the screen.
    const font = `600 12px ${palette.font}`;
    text(person.name, Math.max(left, measure(ctx, person.name, font) / 2 + 4), y + r + 16, font, palette.fg, 'center');
  }
}

function measure(ctx: CanvasRenderingContext2D, value: string, font: string) {
  ctx.font = font;
  return ctx.measureText(value).width;
}
