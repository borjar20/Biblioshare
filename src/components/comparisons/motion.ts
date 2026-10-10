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
    // The same shallow arc is travelled backwards on return. Camera and
    // covers share a single clock, without changing the exterior frame.
    const lift = Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * .1) * 4 * t * (1 - t);
    poses[workKey] = { x: mix(a.x, b.x), y: mix(a.y, b.y) - lift, width: mix(a.width, b.width), height: mix(a.height, b.height), rotate: mix(a.rotate, b.rotate) };
  }
  return { camera: { x: mix(from.camera.x, to.camera.x), y: mix(from.camera.y, to.camera.y), scale: mix(from.camera.scale, to.camera.scale) }, height: mix(from.height, to.height), poses };
}
