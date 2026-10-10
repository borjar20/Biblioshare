import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { View } from './state';
import { regions } from '@/lib/comparisons/derive';
export type Pose = { x: number; y: number; width: number; height: number; rotate: number };
export type Camera = { x: number; y: number; scale: number };
export type Scene = { camera: Camera; height: number; poses: Record<WorkKey, Pose> };
export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 900;
export type VennCircle = { x: number; y: number; radius: number };
export function vennCircles(count: number): VennCircle[] {
  return count === 2 ? [{ x: 370, y: 420, radius: 290 }, { x: 630, y: 420, radius: 290 }]
    : [{ x: 370, y: 330, radius: 270 }, { x: 630, y: 330, radius: 270 }, { x: 500, y: 550, radius: 270 }];
}
export function regionCenter(count: number, mask: number): { x: number; y: number } {
  const centers = count === 2 ? [[240, 420], [760, 420], [500, 420]]
    : [[255, 230], [745, 230], [500, 195], [500, 715], [320, 525], [680, 525], [500, 430]];
  const [x, y] = centers[mask - 1] ?? [500, 430];
  return { x, y };
}
export function groupMapLayout(count: number, width: number) {
  const scale = Math.min(1, Math.max(160, width) / WORLD_WIDTH);
  // Ordinary labels occupy 110 x 48 CSS pixels (two lines). Keep native
  // vertical growth until the 10-person ring fits that envelope.
  const dense = width <= 960 && count >= 5;
  const labelHeight = width <= 300 ? 41 : 48;
  const coverHeight = Math.min(140 * scale, 64) * 1.58;
  // Reserve the two-line label and a rotated cover at the closest midpoint.
  const radiusY = dense ? Math.max(350, (labelHeight + coverHeight + 24) / (scale * (1 - Math.cos(2 * Math.PI / count)))) : 350;
  const centerY = dense ? radiusY + 100 : 450;
  const summaryY = dense ? (centerY + radiusY) * scale + 40 : centerY * scale + 65;
  const worldHeight = dense ? centerY + radiusY + 100 : WORLD_HEIGHT;
  return { centerY, radiusY, summaryY, worldHeight, height: dense ? Math.ceil(summaryY + 140) : Math.max(360, worldHeight * scale) };
}
export function personCenter(index: number, count: number, width = WORLD_WIDTH) {
  // Break the same-height bottom pair in odd dense maps without changing the
  // ordinary/wide ring or giving labels and their connections different points.
  const offset = width <= 960 && count >= 5 && count % 2 ? Math.PI / (2 * count) : 0;
  const angle = index * 2 * Math.PI / Math.max(1, count) - Math.PI / 2 + offset;
  const layout = groupMapLayout(count, width);
  const scale = Math.min(1, Math.max(160, width) / WORLD_WIDTH);
  const labelWidth = width <= 300 ? 68 : 110;
  const radiusX = Math.min(360, Math.max(0, (width - labelWidth) / (2 * scale)));
  return { x: 500 + radiusX * Math.cos(angle), y: layout.centerY + layout.radiusY * Math.sin(angle) };
}
export function mapConnections(snapshot: Snapshot): { people: string[]; keys: WorkKey[] }[] {
  const people = snapshot.group.members.filter(member => member.available && member.userId).map(member => member.userId!);
  const pairs = people.flatMap((person, index) => people.slice(index + 1).map(other => ({ people: [person, other], keys: regions(snapshot, [person, other])[2].keys })));
  // Stable sort preserves the saved participant order for ties.
  return pairs.sort((a, b) => b.keys.length - a.keys.length);
}
/** Fit the entire rotated rectangle, including its edges, in one exact mask. */
function regionCover(count: number, mask: number, center: { x: number; y: number }, desiredWidth: number, slot: number): Pose {
  const stackIndex = slot % 3;
  const rotate = [-5, 3, 8][stackIndex];
  const x = center.x + [0, 10, -10][stackIndex];
  const y = center.y + [0, -4, 4][stackIndex];
  const angle = rotate * Math.PI / 180;
  const circles = vennCircles(count).map(circle => {
    const dx = circle.x - x; const dy = circle.y - y;
    // Rotate each circle's center into the cover's local axes. Distances are
    // unchanged, so extrema on the rectangle can be calculated analytically.
    return { x: Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)),
      y: Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)), radius: circle.radius };
  });
  function fits(width: number) {
    const halfWidth = width / 2; const halfHeight = width * .725;
    return circles.every((circle, index) => mask & (1 << index)
      ? Math.hypot(circle.x + halfWidth, circle.y + halfHeight) <= circle.radius - 3
      : Math.hypot(Math.max(0, circle.x - halfWidth), Math.max(0, circle.y - halfHeight)) >= circle.radius + 3);
  }
  let width = desiredWidth;
  if (!fits(width)) {
    let lower = 0; let upper = width;
    // Nested rectangles make containment monotonic; 24 steps give subpixel
    // precision while preserving a three-world-unit gap from every boundary.
    for (let step = 0; step < 24; step += 1) {
      const middle = (lower + upper) / 2;
      if (fits(middle)) lower = middle; else upper = middle;
    }
    width = lower;
  }
  return { x: x - width / 2, y: y - width * .725, width, height: width * 1.45, rotate };
}
export function layoutScene(snapshot: Snapshot, view: View, viewport: { width: number; height: number }, visibleKeys: WorkKey[]): Scene {
  const width = Math.max(160, viewport.width);
  const scale = Math.min(1, width / WORLD_WIDTH);
  const camera = { x: (width - WORLD_WIDTH * scale) / 2, y: 0, scale };
  const poses: Record<WorkKey, Pose> = {};
  const scene = { camera, height: Math.max(360, WORLD_HEIGHT * scale), poses };
  const overview = view.level === 'group' || view.level === 'venn';
  if (overview) {
    const zones = view.level === 'venn' ? regions(snapshot, view.people) : [];
    const pairs = view.level === 'group' ? mapConnections(snapshot) : [];
    const members = snapshot.group.members.filter(member => member.available && member.userId);
    const mapLayout = groupMapLayout(members.length, width);
    if (view.level === 'group') scene.height = mapLayout.height;
    const taken = new Map<string, number>();
    visibleKeys.forEach((key, index) => {
      const mask = zones.find(zone => zone.keys.includes(key))?.mask ?? 0;
      let center = mask ? regionCenter(view.level === 'venn' ? view.people.length : 2, mask) : { x: 500, y: view.level === 'group' ? mapLayout.centerY : 450 };
      if (view.level === 'group' && !members.every(member => snapshot.works.some(work => work.userId === member.userId && work.key === key))) {
        const pair = pairs.find(pair => pair.keys.includes(key));
        if (pair) {
          const [first, second] = pair.people.map(id => personCenter(members.findIndex(member => member.userId === id), members.length, width));
          center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        }
      }
      const pile = `${center.x}:${center.y}`;
      const slot = taken.get(pile) ?? 0; taken.set(pile, slot + 1);
      const coverWidth = Math.min(140, 64 / scale);
      poses[key] = view.level === 'venn' && mask ? regionCover(view.people.length, mask, center, coverWidth, slot)
        : { x: center.x - coverWidth / 2 + slot * (view.level === 'group' ? 4 : 18), y: center.y - coverWidth * .725 + slot * 5,
        width: coverWidth, height: coverWidth * 1.45, rotate: slot === 0 ? -5 : (index % 3) * 6 - 3 };
    });
    return scene;
  }
  // Grid coordinates belong to the origin region. A work camera changes only the
  // transform: the destination and every other cover keep their world positions.
  const mask = view.level === 'region' ? view.mask : view.level === 'work' && view.origin.kind === 'region' ? view.origin.mask : 3;
  const anchor = view.level === 'facet' || view.level === 'work' && view.origin.kind === 'facet'
    ? { x: 500, y: 450 } : regionCenter(view.people.length, mask);
  const columns = Math.max(2, Math.floor((width - 24) / 126));
  const cell = (width - 32) / columns;
  const coverWidth = Math.min(120, cell - 20);
  const rowHeight = coverWidth * 1.45 + 64;
  visibleKeys.forEach((key, index) => {
    poses[key] = { x: anchor.x + ((index % columns) * cell + (cell - coverWidth) / 2) / scale,
      y: anchor.y + Math.floor(index / columns) * rowHeight / scale,
      width: coverWidth / scale, height: coverWidth * 1.45 / scale, rotate: 0 };
  });
  scene.camera = { x: 16 - anchor.x * scale, y: 20 - anchor.y * scale, scale };
  scene.height = Math.max(260, Math.ceil(visibleKeys.length / columns) * rowHeight + 24);
  if (view.level === 'work' && poses[view.key]) {
    const target = poses[view.key];
    const focusScale = Math.min(180, width * .4) / target.width;
    scene.camera = { x: width / 2 - (target.x + target.width / 2) * focusScale, y: 105 - target.y * focusScale, scale: focusScale };
    scene.height = 760;
  }
  return scene;
}
