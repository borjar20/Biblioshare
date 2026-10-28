import { toScreen } from '@/lib/atlas/camera';
import { AGREE_MAX, FRAME_MAX, FRAME_MIN, RATING_STEP, ratingX } from '@/lib/comparisons/atlas/opinion';
import type { PaintView } from './atlas-palette';

export type OpinionLabels = { axisRef: string; axisOthers: string; loved: string; meh: string; refYes: string; othersYes: string };

/** Frame (ratings 0.5–10.5), agreement band (±1 point) around the diagonal, ticks 1/5/10, axis titles and named corners (prototype `drawOpinionBg`). Text is skipped without labels. */
export function paintOpinionBack({ ctx, cam, vp, palette, text }: PaintView, labels?: OpinionLabels) {
  const k = cam.k;
  const lo = toScreen(cam, vp, { x: ratingX(FRAME_MIN), y: -ratingX(FRAME_MIN) }), hi = toScreen(cam, vp, { x: ratingX(FRAME_MAX), y: -ratingX(FRAME_MAX) });
  const band = RATING_STEP * AGREE_MAX * k;
  ctx.fillStyle = 'rgba(242,194,123,.07)'; ctx.beginPath();
  ctx.moveTo(lo.x, lo.y - band); ctx.lineTo(lo.x, lo.y); ctx.lineTo(lo.x + band, lo.y);
  ctx.lineTo(hi.x, hi.y + band); ctx.lineTo(hi.x, hi.y); ctx.lineTo(hi.x - band, hi.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.strokeRect(lo.x, hi.y, hi.x - lo.x, lo.y - hi.y);
  ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(242,194,123,.35)';
  ctx.beginPath(); ctx.moveTo(lo.x, lo.y); ctx.lineTo(hi.x, hi.y); ctx.stroke(); ctx.setLineDash([]);
  const small = `500 12px ${palette.font}`;
  for (const value of [1, 5, 10]) {
    text(String(value), toScreen(cam, vp, { x: ratingX(value), y: 0 }).x, lo.y + 18, small, palette.faint, 'center');
    text(String(value), lo.x - 12, toScreen(cam, vp, { x: 0, y: -ratingX(value) }).y + 4, small, palette.faint, 'right');
  }
  if (!labels) return;
  const axis = `600 13px ${palette.font}`;
  text(labels.axisRef, hi.x, lo.y + 38, axis, palette.muted, 'right');
  ctx.save(); ctx.translate(lo.x - 36, hi.y); ctx.rotate(-Math.PI / 2); text(labels.axisOthers, 0, 0, axis, palette.muted, 'right'); ctx.restore();
  const big = `800 ${Math.min(30, Math.max(13, 16 * k * 2.4))}px ${palette.font}`;
  ctx.globalAlpha = 0.55;
  text(labels.loved, hi.x - 12, hi.y + 28, big, palette.glow, 'right');
  text(labels.meh, lo.x + 12, lo.y - 14, big, palette.fg, 'left');
  text(labels.refYes, hi.x - 12, lo.y - 14, big, palette.clash, 'right');
  text(labels.othersYes, lo.x + 12, hi.y + 28, big, palette.clash, 'left');
  ctx.globalAlpha = 1;
}
