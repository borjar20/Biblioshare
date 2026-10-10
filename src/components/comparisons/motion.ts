import type { Pose, Scene } from './geometry';
import type { WorkKey } from '@/lib/comparisons/types';
export function sampleMotion(from: Scene, to: Scene, elapsed: number, duration: number): Scene {
  if (duration <= 0 || elapsed >= duration) return to;
  if (elapsed <= 0) return from;
  const progress = elapsed / duration;
  const t = progress * progress * (3 - 2 * progress);
  const mix = (a: number, b: number) => a * (1 - t) + b * t;
  const poses = {} as Record<WorkKey, Pose>;
  for (const key of new Set([...Object.keys(from.poses), ...Object.keys(to.poses)])) {
    const workKey = key as WorkKey;
    const a = from.poses[workKey] ?? to.poses[workKey];
    const b = to.poses[workKey] ?? a;
    // The same shallow arc is travelled backwards on return. Camera, stage
    // height and covers share a single clock, without CSS transform easing.
    const lift = Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * .1) * 4 * t * (1 - t);
    poses[workKey] = { x: mix(a.x, b.x), y: mix(a.y, b.y) - lift, width: mix(a.width, b.width), height: mix(a.height, b.height), rotate: mix(a.rotate, b.rotate) };
  }
  return { camera: { x: mix(from.camera.x, to.camera.x), y: mix(from.camera.y, to.camera.y), scale: mix(from.camera.scale, to.camera.scale) }, height: mix(from.height, to.height), poses };
}
function wheelPixels(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY)) return 0;
  return deltaY * ([1, 16, 800][deltaMode] ?? 0);
}
export function wheelIntent(deltaY: number, deltaMode: number): 'in' | 'out' | null {
  const pixels = wheelPixels(deltaY, deltaMode);
  return Math.abs(pixels) < 80 ? null : pixels < 0 ? 'in' : 'out';
}
export class WheelGesture {
  private total = 0;
  private last = -Infinity;
  captured = false;
  isCaptured(now: number, moving: boolean) {
    if (now - this.last >= 180 && !moving) this.reset();
    return this.captured;
  }
  reset() { this.total = 0; this.last = -Infinity; this.captured = false; }
  push(deltaY: number, deltaMode: number, now: number, moving: boolean): 'in' | 'out' | null {
    if (now - this.last >= 180 && !moving) { this.total = 0; this.captured = false; }
    this.last = now;
    if (this.captured) return null;
    const pixels = wheelPixels(deltaY, deltaMode);
    if (Math.sign(pixels) !== Math.sign(this.total)) this.total = 0;
    this.total += pixels;
    const intent = wheelIntent(this.total, 0);
    if (intent) { this.captured = true; this.total = 0; }
    return intent;
  }
}
