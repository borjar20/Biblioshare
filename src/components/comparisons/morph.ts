/**
 * Map → Venn transformation (#1497). `morph` is the camera clock's shared value: 0 on the
 * group map, 1 on the Venn. Every layer reads its own window of it, so the sequence
 * reverses exactly on return and rebases with the covers when interrupted.
 */
type Point = { x: number; y: number };
type Circle = Point & { radius: number };
const clamp = (value: number) => Math.min(1, Math.max(0, value));
/** Progress of `morph` inside [start, end]. */
export function phase(morph: number, start: number, end: number): number { return clamp((morph - start) / (end - start)); }
/** Settles slightly past its target and back: the counters land with a little weight. */
export function overshoot(t: number): number { const c = 1.25; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; }
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function morphLayers(morph: number) {
  return {
    /** Each pair avatar grows into its circle. */
    circle: phase(morph, 0, .8),
    /** The rest of the group scatters outward and fades, as do the map's curves. */
    map: 1 - phase(morph, 0, .45),
    scatter: phase(morph, 0, .6),
    /** The pair's own curve shrinks into the overlap. */
    link: 1 - phase(morph, .15, .6),
    /** The pair avatars travel to their labels and hand over to them. */
    travel: phase(morph, 0, .7),
    avatar: 1 - phase(morph, .5, .8),
    label: phase(morph, .62, .92),
  };
}
/** An avatar disc becoming a Venn circle, in world units. */
export function morphCircle(from: Circle, to: Circle, t: number): Circle {
  // Grows with its travel, then swells ~6% just before landing so it does not balloon in place.
  const swell = 1 + .06 * Math.sin(Math.PI * phase(t, .7, 1));
  return { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t), radius: Math.max(0, mix(from.radius, to.radius, t) * swell) };
}
/** Region counters arrive one after another and count up to their real value. */
export function regionEntry(morph: number, index: number, count: number) {
  const start = Math.min(.6 + index * .05, .8);
  const t = phase(morph, start, start + .2);
  return { t, scale: t ? overshoot(t) : 0, shown: Math.round(count * (1 - (1 - t) ** 3)) };
}
