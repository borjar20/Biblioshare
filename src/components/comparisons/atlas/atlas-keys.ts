import type { Lens } from '@/lib/comparisons/atlas/scene';

export type AtlasKeyAction = { kind: 'zoom'; factor: number } | { kind: 'fit' } | { kind: 'pan'; dx: number; dy: number } | { kind: 'lens'; lens: Lens };

const ZOOM = 1.4, PAN = 80;
const TEXT_FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const LENS_KEYS: Record<string, Lens> = { 1: 'quien', 2: 'opinion', 3: 'tiempo', 4: 'islas' };

/**
 * Atlas shortcuts (spec §5.3): `+`/`-` zoom, `0`/`F` fit, arrows move, `1`–`4` lenses.
 * With a modifier (browser shortcuts) or inside a text field there is none. A pan's `dx`/`dy`
 * say where the view looks: ArrowRight shows what lies to the right.
 */
export function atlasKeyAction(key: string, mods: { ctrl: boolean; meta: boolean; alt: boolean }, targetTag: string): AtlasKeyAction | null {
  if (mods.ctrl || mods.meta || mods.alt || TEXT_FIELDS.has(targetTag.toUpperCase())) return null;
  switch (key) {
    case '+': case '=': return { kind: 'zoom', factor: ZOOM };
    case '-': case '_': return { kind: 'zoom', factor: 1 / ZOOM };
    case '0': case 'f': case 'F': return { kind: 'fit' };
    case 'ArrowLeft': return { kind: 'pan', dx: -PAN, dy: 0 };
    case 'ArrowRight': return { kind: 'pan', dx: PAN, dy: 0 };
    case 'ArrowUp': return { kind: 'pan', dx: 0, dy: -PAN };
    case 'ArrowDown': return { kind: 'pan', dx: 0, dy: PAN };
  }
  return Object.hasOwn(LENS_KEYS, key) ? { kind: 'lens', lens: LENS_KEYS[key] } : null;
}
