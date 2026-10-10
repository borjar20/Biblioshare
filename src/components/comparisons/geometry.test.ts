import { describe, expect, it } from 'vitest';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import { layoutScene, mapConnections, regionCenter } from './geometry';

const keys = Array.from({ length: 83 }, (_, index) => `book:${index}` as WorkKey);
const snapshot: Snapshot = { group: { id: 'g', name: 'Grupo', revision: 1, members: Array.from({ length: 10 }, (_, i) => ({ slotId: `${i}`, userId: `${i}`, name: `Persona ${i}`, avatarUrl: null, available: true })) }, format: 'all', catalog: keys.map(key => ({ key, title: key, coverUrl: null, genres: [], creators: [] })), works: keys.flatMap(key => ['0', '1', '2'].map(userId => ({ key, userId, rating: null, orderUnknown: false, progress: null }))), excludedSeriesWithoutEpisodes: 0 };
describe('comparison world geometry', () => {
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
