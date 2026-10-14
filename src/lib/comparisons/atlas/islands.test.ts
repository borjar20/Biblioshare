import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { categoriesOf, ISLAND_LIMIT, layoutIslands, OTHER_ISLAND, summarizeIslands } from './islands';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: isMe ? 'Tú' : id.toUpperCase(), avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b'), person('c')];
type Opt = { type?: AtlasWork['itemType']; genres?: string[]; creators?: AtlasWork['creators']; ratings?: Record<string, number | null> };
const work = (id: string, owners: string[], opt: Opt = {}): AtlasWork => ({ key: `${opt.type ?? 'book'}:${id}` as WorkKey, itemType: opt.type ?? 'book', itemId: id,
  title: id, metadataMissing: false, coverUrl: null, genres: opt.genres ?? [], creators: opt.creators ?? [],
  owners: owners.map(userId => ({ userId, rating: opt.ratings?.[userId] ?? null, date: null })) });

describe('categoriesOf', () => {
  it('tipo, géneros únicos y autor/director según el tipo; las series no tienen creador', () => {
    const author = { id: 'a1', name: 'Le Guin', role: 'author' as const }, director = { id: 'd1', name: 'Varda', role: 'director' as const };
    expect(categoriesOf(work('1', ['me']), 'type')).toEqual([{ id: 'book', label: null }]);
    expect(categoriesOf(work('1', ['me'], { genres: ['Drama', 'Drama', 'SF'] }), 'genre')).toEqual([{ id: 'g:Drama', label: 'Drama' }, { id: 'g:SF', label: 'SF' }]);
    expect(categoriesOf(work('1', ['me'], { creators: [author, director] }), 'creator')).toEqual([{ id: 'c:a1', label: 'Le Guin' }]);
    expect(categoriesOf(work('2', ['me'], { type: 'movie', creators: [author, director] }), 'creator')).toEqual([{ id: 'c:d1', label: 'Varda' }]);
    expect(categoriesOf(work('3', ['me'], { type: 'series', creators: [director] }), 'creator')).toEqual([]);
  });
});

describe('layoutIslands', () => {
  const works = [
    work('1', ['me', 'b', 'c'], { genres: ['Drama', 'SF'] }),
    work('2', ['me', 'b'], { genres: ['Drama'] }),
    work('3', ['c'], { genres: ['Poesía'] }),
    work('4', ['me', 'b', 'c'], {}),
    work('5', ['x'], { genres: ['Drama'] }),                        // nobody active owns it
    work('6', ['me', 'b', 'c'], { type: 'movie', genres: ['SF'] }),
  ];
  it('Tipo: islas por tipo no vacías, en orden fijo', () => {
    expect(layoutIslands(people, works, ['me', 'b', 'c'], 'type').islands.map(i => i.id)).toEqual(['book', 'movie']);
  });
  it('Género: una obra común en cada género; sin género va a Otros; las parejas no entran con tres activas', () => {
    const layout = layoutIslands(people, works, ['me', 'b', 'c'], 'genre');
    const byId = new Map(layout.islands.map(i => [i.id, i]));
    expect(byId.get('g:Drama')!.keys.toSorted()).toEqual(['book:1']);
    expect(byId.get('g:SF')!.keys.toSorted()).toEqual(['book:1', 'movie:6']);
    expect(byId.get(OTHER_ISLAND)!.keys).toEqual(['book:4']);
    expect(layout.instances.filter(i => i.key === 'book:1').map(i => i.island).toSorted()).toEqual(['g:Drama', 'g:SF']);
    expect(layout.instances.some(i => i.key === ('book:5' as WorkKey))).toBe(false);
    expect(layout.instances.some(i => i.key === ('book:3' as WorkKey))).toBe(false);
    expect(layout.instances.some(i => i.key === ('book:2' as WorkKey))).toBe(false);
  });
  it('con dos o más caras solo entra lo compartido entre activas; con una, todo lo suyo', () => {
    expect(layoutIslands(people, works, ['me', 'c'], 'genre').instances.map(i => i.key).toSorted()).toEqual(['book:1', 'book:1', 'book:4', 'movie:6']);
    expect(layoutIslands(people, works, ['c'], 'genre').instances.map(i => `${i.key}#${i.island}`).toSorted())
      .toEqual(['book:1#g:Drama', 'book:1#g:SF', 'book:3#g:Poesía', 'book:4#other', 'movie:6#g:SF']);
  });
  it('el núcleo y los recuentos solo incluyen lo común a todas las personas activas', () => {
    const drama = layoutIslands(people, works, ['me', 'b', 'c'], 'genre').islands.find(i => i.id === 'g:Drama')!;
    expect(drama.keys).toEqual(['book:1']);
    expect([drama.common, drama.shared]).toEqual([1, 1]);
    expect(drama.core).toBeGreaterThan(0);
  });
  it('como mucho ISLAND_LIMIT categorías; el resto a Otros', () => {
    const many = Array.from({ length: 12 }, (_, i) => work(`m${i}`, ['me', 'b'], { genres: [`G${String(i).padStart(2, '0')}`] }));
    const layout = layoutIslands(people, many, ['me', 'b'], 'genre');
    expect(layout.islands.filter(i => i.id !== OTHER_ISLAND)).toHaveLength(ISLAND_LIMIT);
    expect(layout.islands.find(i => i.id === OTHER_ISLAND)!.keys).toHaveLength(2);
  });
  it('medias solo con 3 o más obras con nota de esa persona en la isla', () => {
    const rated = [1, 2, 3].map(i => work(`r${i}`, ['me', 'b'], { genres: ['Drama'], ratings: { me: 6 + i, b: i === 1 ? 5 : null } }));
    const drama = layoutIslands(people, rated, ['me', 'b'], 'genre').islands.find(i => i.id === 'g:Drama')!;
    expect(drama.means).toEqual([{ userId: 'me', mean: 8, count: 3 }]);
  });
  it('el tamaño de muestra cuenta solo notas presentes sin tratar ausentes como cero', () => {
    const rated = [9, null, 8, 10].map((rating, i) => work(`r${i}`, ['me', 'b'], { ratings: { me: rating, b: null } }));
    const book = layoutIslands(people, rated, ['me', 'b'], 'type').islands[0];
    expect(book.means).toEqual([{ userId: 'me', mean: 9, count: 3 }]);
  });
  it('una obra de pareja no se cuela en Otros del top diez al seleccionar tres personas', () => {
    const lots = Array.from({ length: 10 }, (_, k) => work(`c${k}`, ['me', 'b', 'c'], { genres: [`Z${String(k).padStart(2, '0')}`] }));
    const lone = work('lone', ['me', 'b'], { genres: ['AAA'] });
    const layout = layoutIslands(people, [lone, ...lots], ['me', 'b', 'c'], 'genre');
    expect(layout.islands.some(i => i.id === 'g:AAA')).toBe(false);
    expect(layout.islands).toHaveLength(ISLAND_LIMIT);
    expect(layout.islands.find(i => i.id === OTHER_ISLAND)).toBeUndefined();
    expect(layout.instances.some(instance => instance.key === 'book:lone')).toBe(false);
  });
  it('una obra de pareja con clave menor no entra en la isla hasta desmarcar la tercera persona', () => {
    const pair = [work('a', ['me', 'b'], { genres: ['Drama'] }), work('z', ['me', 'b', 'c'], { genres: ['Drama'] })];
    const drama = layoutIslands(people, pair, ['me', 'b', 'c'], 'genre').islands.find(i => i.id === 'g:Drama')!;
    expect(drama.keys).toEqual(['book:z']);
    expect(layoutIslands(people, pair, ['me', 'b'], 'genre').islands.find(i => i.id === 'g:Drama')!.keys).toEqual(['book:a', 'book:z']);
  });
  it('las islas no se solapan', () => {
    const { islands } = layoutIslands(people, works, ['me', 'b', 'c'], 'genre');
    for (const a of islands) for (const b of islands) if (a !== b)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
  });
  it.each([
    { width: 360, height: 740, top: 176, bottom: 175 },
    { width: 1280, height: 800, top: 100, bottom: 175 },
  ])('encaja cuatro cabeceras de diez medias sin pisar columnas ni discos en $width px', ({ width, height, top, bottom }) => {
    const faces = Array.from({ length: 10 }, (_, i) => person(`p${i}`));
    const ids = faces.map(face => face.id);
    const rated = Array.from({ length: 3 }, (_, i) => work(`r${i}`, ids, {
      genres: ['Aventura', 'Ciencia ficción', 'Drama', 'Fantasía'], ratings: Object.fromEntries(ids.map(id => [id, 9])),
    }));
    const framed = layoutIslands(faces, rated, ids, 'genre', { viewport: { width, height }, insets: { top, bottom } });
    expect(framed.framing).toBeDefined();
    const cam = framed.framing!.camera;
    expect(cam.k).toBeGreaterThanOrEqual(framed.framing!.ratingZoom);
    const bounds = framed.islands.map(island => ({
      x: (island.x - cam.x) * cam.k + width / 2,
      y: (island.y - cam.y) * cam.k + height / 2,
      r: island.r * cam.k,
    }));
    for (const a of bounds) {
      expect(a.x - 74).toBeGreaterThanOrEqual(16);
      expect(a.x + 74).toBeLessThanOrEqual(width - 16);
      expect(a.y - a.r - 149).toBeGreaterThanOrEqual(top);
      expect(a.y + a.r).toBeLessThanOrEqual(height - bottom);
      for (const b of bounds) if (a !== b) {
        if (Math.abs(a.y - b.y) < 1) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(160);
        if (a.y < b.y) expect(b.y - b.r - 149).toBeGreaterThan(a.y + a.r);
      }
    }
    // Repacking only changes geometry: every face and every appearance stays present.
    expect(framed.islands.every(island => island.means.length === 10)).toBe(true);
    expect(framed.instances).toHaveLength(12);
  });
  it('con once islas en móvil reserva títulos legibles y muestra las medias al acercar sin perder datos', () => {
    const faces = Array.from({ length: 10 }, (_, i) => person(`p${i}`)), ids = faces.map(face => face.id);
    const rated = Array.from({ length: 12 }, (_, genre) => Array.from({ length: 3 }, (_, i) => work(`${genre}-${i}`, ids, {
      genres: [`G${genre}`], ratings: Object.fromEntries(ids.map(id => [id, 9])),
    }))).flat();
    const framed = layoutIslands(faces, rated, ids, 'genre', { viewport: { width: 360, height: 740 }, insets: { top: 176, bottom: 175 } });
    expect(framed.islands).toHaveLength(11);
    expect(framed.framing).toBeDefined();
    expect(framed.framing!.ratingZoom).toBeGreaterThan(framed.framing!.camera.k);
    expect(framed.islands.every(island => island.means.length === 10)).toBe(true);
    expect(framed.instances).toHaveLength(36);
    const cam = framed.framing!.camera;
    for (const island of framed.islands) {
      const y = (island.y - cam.y) * cam.k + 740 / 2;
      expect(y - island.r * cam.k - 32).toBeGreaterThanOrEqual(176);
      expect(y + island.r * cam.k).toBeLessThanOrEqual(740 - 175);
    }
  });
});

describe('summarizeIslands', () => {
  it('la isla con más en común; con una cara, las islas de esa persona; sin nada en común, lo dice', () => {
    const works = [work('1', ['me', 'b'], { genres: ['Drama'] }), work('2', ['me', 'b'], { genres: ['Drama'] }), work('3', ['me', 'b'], { genres: ['SF'] })];
    const layout = layoutIslands(people, works, ['me', 'b'], 'genre');
    expect(summarizeIslands(people, layout, ['me', 'b'])).toMatchObject({ kind: 'best', count: 2, island: { id: 'g:Drama' } });
    expect(summarizeIslands(people, layoutIslands(people, works, ['b'], 'genre'), ['b'])).toEqual({ kind: 'solo', name: 'B' });
    expect(summarizeIslands(people, layoutIslands(people, [work('9', ['me'])], ['me', 'b'], 'genre'), ['me', 'b'])).toEqual({ kind: 'none' });
  });
  it('si lo común solo está en «Otros», lo dice en vez de «nada en común»', () => {
    const works = [work('1', ['me', 'b']), work('2', ['me', 'b']), work('3', ['me'], { genres: ['Drama'] })];
    expect(summarizeIslands(people, layoutIslands(people, works, ['me', 'b'], 'genre'), ['me', 'b'])).toEqual({ kind: 'onlyOther', count: 2 });
    expect(summarizeIslands(people, layoutIslands(people, works, ['me', 'b'], 'creator'), ['me', 'b'])).toEqual({ kind: 'onlyOther', count: 2 });
  });
});
