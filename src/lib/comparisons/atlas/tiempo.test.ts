import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { LANE_GAP, YEAR_STEP, laneGap, laneY, layoutTiempo, summarizeTiempo, yearOf } from './tiempo';

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
  it('con más de 4 vías el hueco se comprime, hasta 110', () => {
    expect([1, 4].map(n => laneGap(n))).toEqual([LANE_GAP, LANE_GAP]);
    expect(laneGap(5)).toBeCloseTo(184);
    expect(laneGap(8)).toBe(115);
    expect(laneGap(10)).toBe(110);
    expect(laneGap(20)).toBe(110);
    expect(laneY(0, 10)).toBeCloseTo(-4.5 * 110);
    expect(laneY(9, 10) - laneY(8, 10)).toBeCloseTo(110);
    // A tall screen (fit limited by width) keeps the full gap.
    expect(laneGap(10, false)).toBe(LANE_GAP);
    expect(laneY(0, 10, false)).toBeCloseTo(-4.5 * LANE_GAP);
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
  it('con dos o más caras solo pinta lo compartido entre activas; con una, todo lo suyo', () => {
    const plus = [...works, work('book:6', { me: '2020-01-01', c: '2020-02-02' })];
    // book:1 is me + b (b off) and book:4 is only c: neither is shared between me and c.
    expect(layoutTiempo(people, plus, ['me', 'c']).instances.map(i => `${i.key}@${i.userId}`).toSorted()).toEqual(['book:6@c', 'book:6@me']);
    expect(layoutTiempo(people, plus, ['c']).instances.map(i => `${i.key}@${i.userId}`).toSorted()).toEqual(['book:4@c', 'book:6@c']);
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
  it('con 10 vías: hueco comprimido, dispersión proporcional y extensión ajustada', () => {
    const ids = 'abcdefghij'.split('');
    const many = ids.map((id, i) => person(id, i === 0));
    const all = Array.from({ length: 40 }, (_, i) => work(`book:${i}`, Object.fromEntries(ids.map((id, j) => [id, `20${10 + (i + j) % 10}-0${1 + i % 9}-15`]))));
    const layout = layoutTiempo(many, all, ids);
    expect(layout.gap).toBe(110);
    expect(layout.lanes[1].y - layout.lanes[0].y).toBeCloseTo(110);
    for (const instance of layout.instances) {
      const lane = layout.lanes.find(l => l.userId === instance.userId)!.y;
      expect(Math.abs(instance.y - lane)).toBeLessThanOrEqual(110 * 75 / 230 + 1e-9);
    }
    expect(layout.extent.maxY - layout.extent.minY).toBeCloseTo(9 * 110 + 300);
    expect(layoutTiempo(many, all, ids, false).gap).toBe(LANE_GAP);
  });
  it('sin fechas, un año por defecto y sin apariciones', () => {
    const layout = layoutTiempo(people, [works[4]], ['me', 'b']);
    expect(layout.instances).toEqual([]);
    expect(layout.endYear - layout.startYear).toBe(1);
  });
});

describe('robustez', () => {
  it('timestamp ISO equivale a su fecha', () => {
    expect(yearOf('2024-01-01T10:00:00Z')).toBe(yearOf('2024-01-01'));
  });
  it('una fecha invalida no genera aparicion ni rompe el rango', () => {
    const layout = layoutTiempo(people, [works[0], work('book:9', { me: 'nope' })], ['me', 'b']);
    expect(layout.instances.some(i => i.key === ('book:9' as WorkKey))).toBe(false);
    expect([layout.startYear, layout.endYear]).toEqual([2021, 2024]);
    expect(Number.isFinite(layout.extent.minX)).toBe(true);
  });
  it('un año inverosímil (antes de 1900 o más allá del año que viene) cuenta como sin fecha', () => {
    const next = new Date().getUTCFullYear() + 1;
    const odd = [works[0], work('book:7', { me: '0001-01-01', b: '1899-12-31' }), work('book:8', { me: `${next + 1}-01-01`, b: `${next}-06-01` })];
    const layout = layoutTiempo(people, odd, ['me', 'b']);
    expect(layout.instances.map(i => `${i.key}@${i.userId}`).toSorted()).toEqual(['book:1@b', 'book:1@me', 'book:8@b']);
    expect([layout.startYear, layout.endYear]).toEqual([2021, next + 1]);
    expect(summarizeTiempo(people, odd, ['me', 'b'])).toEqual({ kind: 'first', first: 1, total: 1, undated: 2 });
  });
  it('es determinista', () => {
    expect(layoutTiempo(people, works, ['me', 'b'])).toEqual(layoutTiempo(people, works, ['me', 'b']));
  });
});

describe('summarizeTiempo', () => {
  it('cuenta primeras llegadas solo entre compartidas con fecha en todos sus dueños activos', () => {
    expect(summarizeTiempo(people, works, ['me', 'b'])).toEqual({ kind: 'first', first: 1, total: 2, undated: 1 });
  });
  it('una fecha ilegible cuenta como sin fecha', () => {
    expect(summarizeTiempo(people, [work('book:9', { me: 'nope', b: '2021-01-01' })], ['me', 'b'])).toEqual({ kind: 'first', first: 0, total: 0, undated: 1 });
  });
  it('sin Tú activa, las vías', () => {
    expect(summarizeTiempo(people, works, ['b', 'c'])).toEqual({ kind: 'lanes', names: ['B', 'C'] });
  });
});
