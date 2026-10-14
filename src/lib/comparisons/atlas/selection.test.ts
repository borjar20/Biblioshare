import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { comparable, layoutQuien } from './layout';
import { layoutOpinion, summarizeOpinion } from './opinion';
import { layoutTiempo, summarizeTiempo } from './tiempo';
import { layoutIslands } from './islands';
import { listSections } from './list';
import { buildScene } from './scene';

const people: AtlasPerson[] = ['a', 'b', 'c'].map(id => ({
  id, name: id.toUpperCase(), isMe: id === 'a', avatarUrl: null, color: '#000000',
}));
const work = (id: string, ids: string[], dates: string[]): AtlasWork => ({
  key: `book:${id}` as WorkKey, itemType: 'book', itemId: id, title: id,
  metadataMissing: false, coverUrl: null, genres: ['Drama', 'SF'], creators: [],
  owners: ids.map((userId, i) => ({ userId, rating: 8 - i, date: dates[i] })),
});
// The pairs have earlier dates: showing one with C active would also distort the timeline range.
const works = [
  work('ab', ['a', 'b'], ['2010-01-01', '2011-01-01']),
  work('ac', ['a', 'c'], ['2012-01-01', '2013-01-01']),
  work('bc', ['b', 'c'], ['2014-01-01', '2015-01-01']),
  work('abc', ['a', 'b', 'c'], ['2023-01-01', '2024-01-01', '2024-06-01']),
];
const layoutsFor = (list: AtlasWork[], active: string[]) => ({
  quien: layoutQuien(people, list, active), opinion: layoutOpinion(people, list, active),
  tiempo: layoutTiempo(people, list, active), islas: layoutIslands(people, list, active, 'genre'),
});

describe('comparaciones entre todas las personas seleccionadas', () => {
  it('exige a cada persona activa; una selección vacía no hace comparable ninguna obra', () => {
    expect(works.map(item => comparable(item, ['a', 'b', 'c']))).toEqual([false, false, false, true]);
    expect(works.map(item => comparable(item, ['a', 'b']))).toEqual([true, false, false, true]);
    expect(works.map(item => comparable(item, ['a']))).toEqual([true, true, false, true]);
    expect(comparable(works[3], [])).toBe(false);
    expect(comparable(works[3], ['a', 'b', 'missing'])).toBe(false);
  });

  it('Opinión compara solo ABC y exige una nota explícita de C, sin suplirla con la media AB', () => {
    const missing = { ...works[3], key: 'book:unrated' as WorkKey,
      owners: works[3].owners.map(owner => owner.userId === 'c' ? { ...owner, rating: null } : owner) };
    const layout = layoutOpinion(people, [...works, missing], ['a', 'b', 'c']);
    expect([...layout.positions.keys()]).toEqual(['book:abc']);
    expect(layout.positions.get('book:abc' as WorkKey)).toMatchObject({ ref: 8, others: 6.5, diff: 1.5 });
    expect(summarizeOpinion(people, layout)).toEqual({ kind: 'counts', agree: 0, clash: 0, total: 1, ref: 'A', isMe: true });
    expect([...layoutOpinion(people, [missing], ['a', 'b']).positions.keys()]).toEqual(['book:unrated']);
  });

  it('Tiempo sitúa solo ABC y calcula el rango y las primeras llegadas entre las tres', () => {
    const layout = layoutTiempo(people, works, ['a', 'b', 'c']);
    expect(layout.instances.map(instance => `${instance.key}@${instance.userId}`))
      .toEqual(['book:abc@a', 'book:abc@b', 'book:abc@c']);
    expect([layout.startYear, layout.endYear]).toEqual([2023, 2025]);
    expect(summarizeTiempo(people, works, ['a', 'b', 'c'])).toEqual({ kind: 'first', first: 1, total: 1, undated: 0 });
  });

  it('Tiempo conserva las fechas disponibles de ABC y cuenta una fecha ausente de C como sin fecha', () => {
    const undated = { ...works[3], owners: works[3].owners.map(owner => owner.userId === 'c' ? { ...owner, date: null } : owner) };
    expect(layoutTiempo(people, [...works.slice(0, 3), undated], ['a', 'b', 'c']).instances
      .map(instance => `${instance.key}@${instance.userId}`)).toEqual(['book:abc@a', 'book:abc@b']);
    expect(summarizeTiempo(people, [...works.slice(0, 3), undated], ['a', 'b', 'c']))
      .toEqual({ kind: 'first', first: 0, total: 0, undated: 1 });
    expect(summarizeTiempo(people, [undated], ['a', 'b'])).toEqual({ kind: 'first', first: 1, total: 1, undated: 0 });
  });

  it('Islas incluye solo ABC en cada género y recupera AB al desmarcar C', () => {
    const all = layoutIslands(people, works, ['a', 'b', 'c'], 'genre');
    expect(all.islands.map(island => ({ id: island.id, keys: island.keys, common: island.common, shared: island.shared })))
      .toEqual([
        { id: 'g:Drama', keys: ['book:abc'], common: 1, shared: 1 },
        { id: 'g:SF', keys: ['book:abc'], common: 1, shared: 1 },
      ]);
    expect(layoutIslands(people, works, ['a', 'b'], 'genre').islands.map(island => island.keys))
      .toEqual([['book:ab', 'book:abc'], ['book:ab', 'book:abc']]);
  });

  it.each(['opinion', 'tiempo', 'islas'] as const)('%s: la lista y la escena muestran solo ABC y recuperan AB al desmarcar C', lens => {
    for (const [active, expected] of [
      [['a', 'b', 'c'], ['book:abc']],
      [['a', 'b'], ['book:ab', 'book:abc']],
    ]) {
      const layouts = layoutsFor(works, active);
      expect([...new Set(listSections(lens, works, active, layouts).flatMap(section => section.keys))].toSorted())
        .toEqual(expected);
      const scene = buildScene(lens, works, active, layouts);
      expect([...new Set([...scene.targets.values()].filter(target => target.alpha > 0).map(target => target.key))].toSorted())
        .toEqual(expected);
      expect(scene.links.map(ids => scene.targets.get(ids[0])!.key).toSorted()).toEqual(lens === 'opinion' ? [] : expected);
    }
  });
});
