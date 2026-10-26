import type { Lens } from '@/lib/comparisons/atlas/scene';
import type { Viewport } from '@/lib/comparisons/atlas/types';
import { coverZoom } from './atlas-palette';

const ITEM_SCALE = 1.4;
const MIN_COVER_WIDTH = 12;
const MIN_HIT_RADIUS = 10;
export type CoverSize = { width: number; height: number };

/** Keep the cover's aspect ratio when its screen width reaches the readable minimum. */
export function coverSize(zoom: number, opinion: boolean): CoverSize {
  const baseWidth = opinion ? 10 : 8.4, baseHeight = opinion ? 14.5 : 12.2;
  const width = Math.max(MIN_COVER_WIDTH, baseWidth * zoom * ITEM_SCALE);
  return { width, height: width * baseHeight / baseWidth };
}

/** These two sizes are shared by every sprite in a frame, without per-item objects. */
export function itemFrame(lens: Lens, zoom: number) {
  return { coverMode: zoom > coverZoom(lens), normal: coverSize(zoom, false), opinion: coverSize(zoom, true) };
}

/** +40 % on the former effective radius, including its former low-zoom minimum. */
export function dotRadius(zoom: number, shared: boolean, opinion: boolean, highlight: number): number {
  const previous = opinion ? Math.max(3, 4.2 * zoom * 1.4) : Math.max(1.5, (shared ? 3.4 : 2.4) * zoom * 1.4);
  return previous * ITEM_SCALE * (1 + highlight * 0.45);
}

/** Full cover rectangle (including corners), circular dots and the existing 10 px hit minimum. */
export function containsItem(dx: number, dy: number, coverMode: boolean, size: CoverSize, radius: number): boolean {
  if (coverMode) return Math.abs(dx) <= Math.max(MIN_HIT_RADIUS, size.width / 2)
    && Math.abs(dy) <= Math.max(MIN_HIT_RADIUS, size.height / 2);
  return dx * dx + dy * dy <= Math.max(MIN_HIT_RADIUS, radius) ** 2;
}

/** Cull only once the actual cover/dot and its painted border are wholly outside the screen. */
export function itemVisible(x: number, y: number, halfWidth: number, halfHeight: number, viewport: Viewport): boolean {
  return x + halfWidth >= 0 && y + halfHeight >= 0 && x - halfWidth <= viewport.width && y - halfHeight <= viewport.height;
}
