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
    text(String(year), x + 6, top + 14, `600 12px ${palette.font}`, palette.faint, 'left');
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
    text(person.name, left, y + r + 16, `600 12px ${palette.font}`, palette.fg, 'center');
  }
}
