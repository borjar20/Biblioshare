import { describe, expect, it } from 'vitest';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import { groupMapLayout, personCenter, layoutScene, mapConnections, regionCenter, vennCircles, type Pose } from './geometry';

const keys = Array.from({ length: 83 }, (_, index) => `book:${index}` as WorkKey);
const snapshot: Snapshot = { group: { id: 'g', name: 'Grupo', revision: 1, members: Array.from({ length: 10 }, (_, i) => ({ slotId: `${i}`, userId: `${i}`, name: `Persona ${i}`, avatarUrl: null, available: true })) }, format: 'all', catalog: keys.map(key => ({ key, title: key, coverUrl: null, genres: [], creators: [] })), works: keys.flatMap(key => ['0', '1', '2'].map(userId => ({ key, userId, rating: null, orderUnknown: false, progress: null }))), excludedSeriesWithoutEpisodes: 0 };
type Point = { x: number; y: number };
function corners(pose: Pose): Point[] {
  const angle = pose.rotate * Math.PI / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
    x: pose.x + pose.width / 2 + x * pose.width / 2 * Math.cos(angle) - y * pose.height / 2 * Math.sin(angle),
    y: pose.y + pose.height / 2 + x * pose.width / 2 * Math.sin(angle) + y * pose.height / 2 * Math.cos(angle),
  }));
}
/** Polygon/segment oracle: tests the whole excluded disk, not only corners. */
function distanceToFootprint(point: Point, polygon: Point[]): number {
  const sides = polygon.map((a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    const dx = b.x - a.x; const dy = b.y - a.y;
    const cross = dx * (point.y - a.y) - dy * (point.x - a.x);
    const projection = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    return { cross, distance: Math.hypot(point.x - a.x - projection * dx, point.y - a.y - projection * dy) };
  });
  if (sides.every(side => side.cross >= 0) || sides.every(side => side.cross <= 0)) return 0;
  return Math.min(...sides.map(side => side.distance));
}
function exactZones(count: number, samples: number) {
  const people = Array.from({ length: count }, (_, index) => String(index));
  const entries = Array.from({ length: (1 << count) - 1 }, (_, index) => index + 1)
    .flatMap(mask => Array.from({ length: samples }, (_, sample) => ({ mask, key: `book:mask-${mask}-${sample}` as WorkKey })));
  const data: Snapshot = { ...snapshot, catalog: entries.map(({ key }) => ({ key, title: key, coverUrl: null, genres: [], creators: [] })),
    works: entries.flatMap(({ key, mask }) => people.filter((_, index) => mask & (1 << index)).map(userId => ({ key, userId, rating: null, orderUnknown: false, progress: null }))) };
  return { data, entries, people };
}
describe('comparison world geometry', () => {
  it.each([5, 6, 7, 8, 9, 10])('separates two-line name footprints and the summary in a narrow %i-person map', count => {
    const width = 254, scale = width / 1000, layout = groupMapLayout(count, width);
    const chips = Array.from({ length: count }, (_, index) => {
      const point = personCenter(index, count, width);
      return { left: point.x * scale - 34, right: point.x * scale + 34, top: point.y * scale - 23.5, bottom: point.y * scale + 23.5 };
    });
    for (const chip of chips) {
      expect(chip.left).toBeGreaterThanOrEqual(0); expect(chip.right).toBeLessThanOrEqual(width);
      expect(chip.top).toBeGreaterThanOrEqual(0); expect(chip.bottom).toBeLessThan(layout.summaryY);
    }
    for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
      expect(Math.max(0, Math.min(chips[a].right, chips[b].right) - Math.max(chips[a].left, chips[b].left))
        * Math.max(0, Math.min(chips[a].bottom, chips[b].bottom) - Math.max(chips[a].top, chips[b].top))).toBe(0);
    }
    expect(layout.height).toBeGreaterThan(layout.summaryY + 100);
    const data = { ...snapshot, group: { ...snapshot.group, members: snapshot.group.members.slice(0, count) } };
    const scene = layoutScene(data, { level: 'group' }, { width, height: 500 }, [keys[0]]);
    expect(scene.height).toBe(layout.height);
    const first = personCenter(0, count, width), second = personCenter(1, count, width);
    const pose = scene.poses[keys[0]];
    expect(pose.x + pose.width / 2).toBeCloseTo((first.x + second.x) / 2);
    expect(pose.y + pose.height / 2).toBeCloseTo((first.y + second.y) / 2);
  });
  it('preserves the original wide map and the pair/trio coordinate system', () => {
    expect(groupMapLayout(10, 768)).toMatchObject({ centerY: 450, radiusY: 350, worldHeight: 900 });
    expect(groupMapLayout(3, 254)).toMatchObject({ centerY: 450, radiusY: 350, worldHeight: 900 });
    expect(personCenter(0, 10, 768)).toEqual({ x: 500, y: 100 });
  });
  it('footprint oracle catches excluded circles crossing an edge when every corner is outside', () => {
    const polygon = corners({ x: 0, y: 0, width: 100, height: 100, rotate: 0 });
    const circle = { x: 110, y: 50, radius: 20 };
    expect(polygon.every(point => Math.hypot(point.x - circle.x, point.y - circle.y) > circle.radius)).toBe(true);
    expect(distanceToFootprint(circle, polygon)).toBe(10);
    expect(distanceToFootprint({ x: 50, y: 50 }, polygon)).toBe(0);
  });
  it.each([2, 3].flatMap(count => [320, 640, 1280].map(width => [count, width])))('contains every rotated footprint in its exact %i-person zone at %i px', (count, width) => {
    const samples = width <= 360 ? 1 : 3;
    const { data, entries, people } = exactZones(count, samples);
    const scene = layoutScene(data, { level: 'venn', people }, { width, height: 500 }, entries.map(entry => entry.key));
    expect(Object.keys(scene.poses)).toHaveLength(((1 << count) - 1) * samples);
    for (const { key, mask } of entries) {
      const pose = scene.poses[key]; const polygon = corners(pose);
      expect(pose.width).toBeGreaterThan(0); expect(pose.height).toBeGreaterThan(0);
      for (const point of polygon) {
        expect(scene.camera.x + point.x * scene.camera.scale).toBeGreaterThanOrEqual(0);
        expect(scene.camera.x + point.x * scene.camera.scale).toBeLessThanOrEqual(width);
        expect(scene.camera.y + point.y * scene.camera.scale).toBeGreaterThanOrEqual(0);
        expect(scene.camera.y + point.y * scene.camera.scale).toBeLessThanOrEqual(scene.height);
      }
      vennCircles(count).forEach((circle, index) => {
        if (mask & (1 << index)) {
          for (const point of polygon) expect(Math.hypot(point.x - circle.x, point.y - circle.y), `${key} leaves included circle ${index}`).toBeLessThanOrEqual(circle.radius);
        } else expect(distanceToFootprint(circle, polygon), `${key} intersects excluded circle ${index}`).toBeGreaterThanOrEqual(circle.radius);
      });
    }
  });
  it.each([320, 1280])('keeps pair/trio representative covers in their exact zone at %i px', width => {
    for (const people of [['0', '1'], ['0', '1', '2']]) {
      const scene = layoutScene(snapshot, { level: 'venn', people }, { width, height: 500 }, keys.slice(0, 3));
      const center = regionCenter(people.length, (1 << people.length) - 1);
      expect(Object.keys(scene.poses)).toHaveLength(3);
      for (const pose of Object.values(scene.poses)) {
        expect(pose.width).toBeGreaterThan(0); expect(pose.height).toBeGreaterThan(0);
        expect(Math.abs(pose.x + pose.width / 2 - center.x)).toBeLessThan(100);
        const screenX = scene.camera.x + pose.x * scene.camera.scale;
        expect(screenX).toBeGreaterThanOrEqual(0);
        expect(screenX + pose.width * scene.camera.scale).toBeLessThanOrEqual(width);
      }
    }
  });
  it.each([320, 1280])('appends 24-item batches without moving existing rows at %i px', width => {
    const view = { level: 'region' as const, people: ['0', '1'], mask: 3 };
    const first = layoutScene(snapshot, view, { width, height: 500 }, keys.slice(0, 24));
    const full = layoutScene(snapshot, view, { width, height: 500 }, keys);
    for (const key of keys.slice(0, 24)) expect(full.poses[key]).toEqual(first.poses[key]);
    expect(full.height).toBeGreaterThan(first.height);
    const detail = layoutScene(snapshot, { level: 'work', people: view.people, origin: { kind: 'region', mask: 3 }, key: keys[23] }, { width, height: 500 }, keys);
    expect(detail.poses).toEqual(full.poses);
    expect(detail.camera).not.toEqual(full.camera);
  });
  it('shows all 45 pairs in a ten-person map, ordered by common count then saved order', () => {
    const pairs = mapConnections(snapshot);
    expect(pairs).toHaveLength(45);
    expect(pairs.slice(0, 3).map(pair => pair.people)).toEqual([['0', '1'], ['0', '2'], ['1', '2']]);
    expect(pairs[0].keys).toHaveLength(83);
    expect(() => layoutScene(snapshot, { level: 'group' }, { width: 320, height: 500 }, keys.slice(0, 3))).not.toThrow();
  });
});
