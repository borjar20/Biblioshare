import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { View } from './state';
import { regions } from '@/lib/comparisons/derive';
export type Pose = { x: number; y: number; width: number; height: number; rotate: number };
export type Camera = { x: number; y: number; scale: number };
export type Scene = { camera: Camera; height: number; poses: Record<WorkKey, Pose> };
export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 900;
export function regionCenter(count: number, mask: number): { x: number; y: number } {
  const centers = count === 2 ? [[240, 420], [760, 420], [500, 420]]
    : [[255, 230], [745, 230], [500, 225], [500, 715], [320, 525], [680, 525], [500, 430]];
  const [x, y] = centers[mask - 1] ?? [500, 430];
  return { x, y };
}
export function personCenter(index: number, count: number) {
  const angle = index * 2 * Math.PI / Math.max(1, count) - Math.PI / 2;
  return { x: 500 + 360 * Math.cos(angle), y: 450 + 350 * Math.sin(angle) };
}
export function mapConnections(snapshot: Snapshot): { people: string[]; keys: WorkKey[] }[] {
  const people = snapshot.group.members.filter(member => member.available && member.userId).map(member => member.userId!);
  const pairs = people.flatMap((person, index) => people.slice(index + 1).map(other => ({ people: [person, other], keys: regions(snapshot, [person, other])[2].keys })));
  // Stable sort preserves the saved participant order for ties.
  return pairs.sort((a, b) => b.keys.length - a.keys.length);
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
    const taken = new Map<string, number>();
    visibleKeys.forEach((key, index) => {
      const mask = zones.find(zone => zone.keys.includes(key))?.mask ?? 0;
      let center = mask ? regionCenter(view.level === 'venn' ? view.people.length : 2, mask) : { x: 500, y: 450 };
      if (view.level === 'group' && !members.every(member => snapshot.works.some(work => work.userId === member.userId && work.key === key))) {
        const pair = pairs.find(pair => pair.keys.includes(key));
        if (pair) {
          const [first, second] = pair.people.map(id => personCenter(members.findIndex(member => member.userId === id), members.length));
          center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        }
      }
      const pile = `${center.x}:${center.y}`;
      const slot = taken.get(pile) ?? 0; taken.set(pile, slot + 1);
      const coverWidth = Math.min(140, 64 / scale);
      poses[key] = { x: center.x - coverWidth / 2 + slot * 18, y: center.y - coverWidth * .725 + slot * 5,
        width: coverWidth, height: coverWidth * 1.45, rotate: slot === 0 ? -5 : (index % 3) * 6 - 3 };
    });
    return scene;
  }
  // Grid coordinates belong to the origin region. A work camera changes only the
  // transform: the destination and every other cover keep their world positions.
  const mask = view.level === 'region' ? view.mask : view.level === 'work' && view.origin.kind === 'region' ? view.origin.mask : 3;
  const anchor = regionCenter(view.people.length, mask);
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
