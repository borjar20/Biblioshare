import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { LANE_GAP, YEAR_STEP, laneY, layoutTiempo, summarizeTiempo, yearOf } from './tiempo';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: isMe ? 'Tú' : id.toUpperCase(), avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b'), person('c')];
const work = (key: string, dates: Record<string, string | null>): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: [], creators: [],
  owners: Object.entries(dates).map(([userId, date]) => ({ userId, rating: null, date })) });
const works = [
  work('book:1', { me: '2021-03-01', b: '2023-06-01' }),   // me first
  work('book:2', { me: '2024-01-10', b: '2022-12-31' }),   // b first
  work('book:3', { me: '2022-05-05', b: null }),           // shared, undated for b
  work('book:4', { c: '2019-07-07' }),                     // only c
  work('book:5', { me: null }),                            // no date at all
];

describe('yearOf / laneY', () => {
  it('fracción de año a mitad del día', () => {
    expect(yearOf('2024-01-01')).toBeCloseTo(2024 + 0.5 / 366, 6);
    expect(Math.floor(yearOf('2023-12-31'))).toBe(2023);
  });
  it('vías centradas', () => {
    expect([0, 1, 2].map(i => laneY(i, 3))).toEqual([-LANE_GAP, 0, LANE_GAP]);
    expect(laneY(0, 1)).toBe(0);
  });
});

describe('layoutTiempo', () => {
  it('una aparición por dueño activo con fecha, en su vía', () => {
    const layout = layoutTiempo(people, works, ['me', 'b']);
    expect(layout.lanes).toEqual([{ userId: 'me', y: -LANE_GAP / 2 }, { userId: 'b', y: LANE_GAP / 2 }]);
    expect(layout.instances.map(i => `${i.key}@${i.userId}`).toSorted())
      .toEqual(['book:1@b', 'book:1@me', 'book:2@b', 'book:2@me', 'book:3@me']);
    for (const instance of layout.instances) {
      const lane = layout.lanes.find(l => l.userId === instance.userId)!.y;
      expect(Math.abs(instance.y - lane)).toBeLessThanOrEqual(75);
    }
  });
  it('rango redondeado a años completos y X lineal en el año', () => {
    const layout = layoutTiempo(people, works, ['me', 'b']);
    expect([layout.startYear, layout.endYear]).toEqual([2021, 2025]);
    const mid = (2021 + 2025) / 2;
    const one = layout.instances.find(i => i.key === 'book:1' && i.userId === 'me')!;
    expect(one.x).toBeCloseTo((yearOf('2021-03-01') - mid) * YEAR_STEP);
    expect(layout.extent.minX).toBeCloseTo((2021 - mid) * YEAR_STEP - 260);
    expect(layout.extent.maxX).toBeCloseTo((2025 - mid) * YEAR_STEP + 60);
  });
  it('sin fechas, un año por defecto y sin apariciones', () => {
    const layout = layoutTiempo(people, [works[4]], ['me', 'b']);
    expect(layout.instances).toEqual([]);
    expect(layout.endYear - layout.startYear).toBe(1);
  });
});

describe('summarizeTiempo', () => {
  it('cuenta primeras llegadas solo entre compartidas con fecha en todos sus dueños activos', () => {
    expect(summarizeTiempo(people, works, ['me', 'b'])).toEqual({ kind: 'first', first: 1, total: 2, undated: 1 });
  });
  it('sin Tú activa, las vías', () => {
    expect(summarizeTiempo(people, works, ['b', 'c'])).toEqual({ kind: 'lanes', names: ['B', 'C'] });
  });
});
