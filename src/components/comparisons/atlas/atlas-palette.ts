import type { AtlasWork, Camera, Viewport } from '@/lib/comparisons/atlas/types';

export const COVER_ZOOM = 1.1;
export const TITLE_ZOOM = 3.2;

export type Palette = { fg: string; muted: string; line: string; glow: string; cream: string; faint: string; clash: string; font: string;
  type: Record<AtlasWork['itemType'], string> };

export function readPalette(host: Element): Palette {
  const css = getComputedStyle(host);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return { fg: v('--atlas-fg', '#f1e7dd'), muted: v('--atlas-muted', '#b2a293'), line: v('--atlas-line', '#4a3d34'),
    glow: v('--atlas-glow', '#f2c27b'), cream: v('--atlas-cream', '#e9dccf'), faint: v('--atlas-faint', '#7d6e62'),
    clash: v('--atlas-clash', '#e2735f'), font: css.fontFamily || 'system-ui, sans-serif',
    type: { book: v('--type-book', '#cf8a54'), movie: v('--type-movie', '#6bb0b4'), series: v('--type-series', '#b592bd') } };
}

/** What a lens painter needs from the engine for one frame. */
export type PaintView = {
  ctx: CanvasRenderingContext2D; cam: Camera; vp: Viewport; palette: Palette;
  text: (value: string, x: number, y: number, font: string, color: string, align?: CanvasTextAlign) => void;
};
