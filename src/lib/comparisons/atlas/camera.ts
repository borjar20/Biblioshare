import type { Camera, Extent, Point, Viewport } from './types';

export const MIN_ZOOM = 0.08;
export const MAX_ZOOM = 16;
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function toScreen(cam: Camera, vp: Viewport, p: Point): Point {
  return { x: (p.x - cam.x) * cam.k + vp.width / 2, y: (p.y - cam.y) * cam.k + vp.height / 2 };
}
export function toWorld(cam: Camera, vp: Viewport, s: Point): Point {
  return { x: (s.x - vp.width / 2) / cam.k + cam.x, y: (s.y - vp.height / 2) / cam.k + cam.y };
}
/** Zoom keeping the world point under `s` fixed on screen. */
export function zoomAt(cam: Camera, vp: Viewport, s: Point, factor: number): Camera {
  const k = clamp(cam.k * factor, MIN_ZOOM, MAX_ZOOM);
  const w = toWorld(cam, vp, s);
  return { k, x: w.x - (s.x - vp.width / 2) / k, y: w.y - (s.y - vp.height / 2) / k };
}
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { k: cam.k, x: cam.x - dx / cam.k, y: cam.y - dy / cam.k };
}
/** Centre `s` and multiply the zoom (double click / double tap). */
export function zoomToward(cam: Camera, vp: Viewport, s: Point, factor: number, maxK = 14): Camera {
  const w = toWorld(cam, vp, s);
  return { x: w.x, y: w.y, k: Math.min(maxK, cam.k * factor) };
}
export function fit(extent: Extent, vp: Viewport, pad: Point, maxK = 4): Camera {
  const k = Math.min((vp.width - pad.x) / (extent.maxX - extent.minX), (vp.height - pad.y) / (extent.maxY - extent.minY));
  return { x: (extent.minX + extent.maxX) / 2, y: (extent.minY + extent.maxY) / 2, k: clamp(k, MIN_ZOOM, maxK) };
}
export function stepCamera(cam: Camera, target: Camera, f: number): { camera: Camera; done: boolean } {
  const k = cam.k * Math.pow(target.k / cam.k, f);
  const x = cam.x + (target.x - cam.x) * f, y = cam.y + (target.y - cam.y) * f;
  if (Math.abs(target.k / k - 1) < 0.002 && Math.hypot(target.x - x, target.y - y) < 0.5) return { camera: { ...target }, done: true };
  return { camera: { x, y, k }, done: false };
}
export function approach(value: number, target: number, factor: number, epsilon: number): { value: number; settled: boolean } {
  if (Math.abs(target - value) <= epsilon) return { value: target, settled: true };
  return { value: value + (target - value) * factor, settled: false };
}
