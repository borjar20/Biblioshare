import type { WorkKey } from '@/lib/comparisons/types';
import type { Camera, Viewport } from '@/lib/comparisons/atlas/types';
import type { Scene } from '@/lib/comparisons/atlas/scene';

/** One appearance of a work; `key` is the work, the map id may carry an `@person` / `#island` suffix. `dying` extras fly home and fade. */
export type Sprite = { key: WorkKey; x: number; y: number; tx: number; ty: number; a: number; ta: number; hl: number; thl: number; diff: number | null; dying: boolean };
export type Sprites = Map<string, Sprite>;
export type ProbeHit = { key: WorkKey; x: number; y: number };

/** Points the sprites at the scene's targets; extras of a work still on stage fold back into it before going. */
export function syncSprites(sprites: Sprites, scene: Scene, reduce: boolean) {
  for (const [id, t] of scene.targets) {
    const glow = t.glow ? 1 : 0;
    // An extra appearance is born on its main one, invisible, and flies out from there.
    const main = id !== t.key ? sprites.get(t.key) : undefined;
    const sprite = sprites.get(id) ?? (main ? { ...main, a: 0 }
      : { key: t.key, x: t.x, y: t.y, tx: t.x, ty: t.y, a: t.alpha, ta: t.alpha, hl: glow, thl: 0, diff: t.diff, dying: false });
    sprite.key = t.key; sprite.tx = t.x; sprite.ty = t.y; sprite.ta = t.alpha; sprite.thl = glow; sprite.diff = t.diff; sprite.dying = false;
    if (reduce) { sprite.x = t.x; sprite.y = t.y; sprite.a = sprite.ta; sprite.hl = sprite.thl; }
    sprites.set(id, sprite);
  }
  for (const [id, sprite] of [...sprites]) {
    if (scene.targets.has(id)) continue;
    // An extra whose work is still on stage folds back into its main appearance; anything else goes at once.
    const home = id !== sprite.key && !reduce ? scene.targets.get(sprite.key) : undefined;
    if (home) { sprite.dying = true; sprite.tx = home.x; sprite.ty = home.y; sprite.ta = 0; }
    else sprites.delete(id);
  }
}

/**
 * One interpolation step for every sprite, in place (same maths as `approach`, without its result objects:
 * this runs for ~10.000 sprites per frame). Faded dying extras are removed. Returns whether any is still moving.
 */
export function stepSprites(sprites: Sprites): boolean {
  let moving = false;
  sprites.forEach((s, id) => {
    let settled = true; let d = s.tx - s.x;
    if (Math.abs(d) <= 0.15) s.x = s.tx; else { s.x += d * 0.11; settled = false; }
    d = s.ty - s.y; if (Math.abs(d) <= 0.15) s.y = s.ty; else { s.y += d * 0.11; settled = false; }
    d = s.ta - s.a; if (Math.abs(d) <= 0.01) s.a = s.ta; else { s.a += d * 0.14; settled = false; }
    d = s.thl - s.hl; if (Math.abs(d) <= 0.01) s.hl = s.thl; else { s.hl += d * 0.14; settled = false; }
    if (s.dying && s.a < 0.02) sprites.delete(id);
    else if (!settled) moving = true;
  });
  return moving;
}

/** The test probe: one entry per work, its first appearance on screen, sorted by key (at most 60). */
export function probeOf(sprites: Sprites, cam: Camera, vp: Viewport): ProbeHit[] {
  const probe: ProbeHit[] = []; const listed = new Set<WorkKey>();
  for (const s of sprites.values()) {
    if (s.a < 0.5 || listed.has(s.key)) continue;
    const x = (s.x - cam.x) * cam.k + vp.width / 2, y = (s.y - cam.y) * cam.k + vp.height / 2;
    if (x >= 0 && y >= 0 && x <= vp.width && y <= vp.height) { listed.add(s.key); probe.push({ key: s.key, x: Math.round(x), y: Math.round(y) }); }
  }
  return probe.toSorted((a, b) => a.key < b.key ? -1 : 1).slice(0, 60);
}

/** Nearest live sprite to a world point within `radius` (ties go to the later one, like `nearest`). */
export function nearestSprite(sprites: Sprites, wx: number, wy: number, radius: number): Sprite | null {
  let best: Sprite | null = null; let distance = radius;
  for (const s of sprites.values()) {
    if (s.dying || s.a < 0.5) continue;
    const d = Math.hypot(s.x - wx, s.y - wy);
    if (d <= distance) { distance = d; best = s; }
  }
  return best;
}
