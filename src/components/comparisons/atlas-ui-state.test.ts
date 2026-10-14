import { describe, expect, it } from 'vitest';
import { atlasQuery, parseAtlasQuery, readGroupMemory, writeGroupMemory } from './atlas-ui-state';

function fakeStorage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
const throwing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };

describe('parseAtlasQuery', () => {
  it('lee la lente y el modo de Islas en castellano', () => {
    expect(parseAtlasQuery(new URLSearchParams('lente=tiempo&islas=genero'))).toEqual({ lens: 'tiempo', islandMode: 'genre' });
    expect(parseAtlasQuery(new URLSearchParams('lente=islas&islas=autor'))).toEqual({ lens: 'islas', islandMode: 'creator' });
    expect(parseAtlasQuery(new URLSearchParams('lente=opinion&islas=tipo'))).toEqual({ lens: 'opinion', islandMode: 'type' });
  });
  it('sin parámetros o con valores desconocidos da los valores por defecto', () => {
    expect(parseAtlasQuery(new URLSearchParams(''))).toEqual({ lens: 'quien', islandMode: 'type' });
    expect(parseAtlasQuery(new URLSearchParams('lente=mapa&islas=genre'))).toEqual({ lens: 'quien', islandMode: 'type' });
    expect(parseAtlasQuery(new URLSearchParams('lente=toString&islas=constructor'))).toEqual({ lens: 'quien', islandMode: 'type' });
  });
});

describe('atlasQuery', () => {
  it('conserva group y con, y omite los valores por defecto', () => {
    expect(atlasQuery(new URLSearchParams('group=g1'), 'quien', 'type')).toBe('group=g1');
    expect(atlasQuery(new URLSearchParams('con=p1'), 'tiempo', 'type')).toBe('con=p1&lente=tiempo');
    expect(atlasQuery(new URLSearchParams('group=g1&lente=tiempo&islas=autor'), 'islas', 'genre')).toBe('group=g1&lente=islas&islas=genero');
    expect(atlasQuery(new URLSearchParams('group=g1&lente=tiempo&islas=autor'), 'quien', 'type')).toBe('group=g1');
  });
  it('no arrastra otros parámetros y sin nada que decir queda vacía', () => {
    expect(atlasQuery(new URLSearchParams('otro=1'), 'quien', 'type')).toBe('');
    expect(atlasQuery(new URLSearchParams(''), 'opinion', 'creator')).toBe('lente=opinion&islas=autor');
  });
  it('es ida y vuelta con parseAtlasQuery', () => {
    const query = atlasQuery(new URLSearchParams('group=g1'), 'islas', 'creator');
    expect(parseAtlasQuery(new URLSearchParams(query))).toEqual({ lens: 'islas', islandMode: 'creator' });
  });
});

describe('memoria por grupo', () => {
  it('ida y vuelta de caras y cámara, cada grupo con lo suyo', () => {
    const storage = fakeStorage();
    writeGroupMemory(storage, 'g1', { faces: ['a', 'b'] });
    writeGroupMemory(storage, 'g1', { camera: { lens: 'opinion', x: 1, y: 2, k: 0.5 } });
    writeGroupMemory(storage, 'g2', { faces: ['c'] });
    expect(readGroupMemory(storage, 'g1')).toEqual({ faces: ['a', 'b'], camera: { lens: 'opinion', x: 1, y: 2, k: 0.5 } });
    expect(readGroupMemory(storage, 'g2')).toEqual({ faces: ['c'], camera: null });
    expect(readGroupMemory(storage, 'g3')).toEqual({ faces: null, camera: null });
    expect([...storage.data.keys()].sort()).toEqual(['biblioshare:atlas:g1', 'biblioshare:atlas:g2']);
  });
  it('un storage que lanza o que no existe no rompe nada', () => {
    expect(readGroupMemory(throwing, 'g1')).toEqual({ faces: null, camera: null });
    expect(() => writeGroupMemory(throwing, 'g1', { faces: ['a'] })).not.toThrow();
    expect(readGroupMemory(null, 'g1')).toEqual({ faces: null, camera: null });
    expect(() => writeGroupMemory(null, 'g1', { faces: ['a'] })).not.toThrow();
  });
  it('JSON corrupto o con forma ajena se ignora', () => {
    const storage = fakeStorage();
    storage.data.set('biblioshare:atlas:g1', '{no es json');
    expect(readGroupMemory(storage, 'g1')).toEqual({ faces: null, camera: null });
    storage.data.set('biblioshare:atlas:g1', JSON.stringify({ faces: [1, 2], camera: { lens: 'mapa', x: 0, y: 0, k: 1 } }));
    expect(readGroupMemory(storage, 'g1')).toEqual({ faces: null, camera: null });
    storage.data.set('biblioshare:atlas:g1', JSON.stringify({ faces: 'a', camera: { lens: 'quien', x: 'x', y: 0, k: 0 } }));
    expect(readGroupMemory(storage, 'g1')).toEqual({ faces: null, camera: null });
    storage.data.set('biblioshare:atlas:g1', 'null');
    expect(readGroupMemory(storage, 'g1')).toEqual({ faces: null, camera: null });
    // Writing over garbage starts a clean record.
    writeGroupMemory(storage, 'g1', { faces: ['a'] });
    expect(readGroupMemory(storage, 'g1')).toEqual({ faces: ['a'], camera: null });
  });
});
