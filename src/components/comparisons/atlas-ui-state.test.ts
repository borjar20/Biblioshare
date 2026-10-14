import { describe, expect, it } from 'vitest';
import { atlasQuery, clearAtlasMemory, parseAtlasQuery, readGroupMemory, writeGroupMemory } from './atlas-ui-state';

function fakeStorage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }, key: (index: number) => [...data.keys()][index] ?? null, get length() { return data.size; } };
}
const fail = (): never => { throw new Error('SecurityError'); };
const throwing = { getItem: fail, setItem: fail, removeItem: fail, key: fail, get length(): number { return fail(); } };

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
    writeGroupMemory(storage, 'v1', 'g1', { faces: ['a', 'b'] });
    writeGroupMemory(storage, 'v1', 'g1', { camera: { lens: 'opinion', x: 1, y: 2, k: 0.5 } });
    writeGroupMemory(storage, 'v1', 'g2', { faces: ['c'] });
    expect(readGroupMemory(storage, 'v1', 'g1')).toEqual({ faces: ['a', 'b'], camera: { lens: 'opinion', x: 1, y: 2, k: 0.5 } });
    expect(readGroupMemory(storage, 'v1', 'g2')).toEqual({ faces: ['c'], camera: null });
    expect(readGroupMemory(storage, 'v1', 'g3')).toEqual({ faces: null, camera: null });
    expect([...storage.data.keys()].sort()).toEqual(['biblioshare:atlas:v1:g1', 'biblioshare:atlas:v1:g2']);
  });
  it('un storage que lanza o que no existe no rompe nada', () => {
    expect(readGroupMemory(throwing, 'v1', 'g1')).toEqual({ faces: null, camera: null });
    expect(() => writeGroupMemory(throwing, 'v1', 'g1', { faces: ['a'] })).not.toThrow();
    expect(readGroupMemory(null, 'v1', 'g1')).toEqual({ faces: null, camera: null });
    expect(() => writeGroupMemory(null, 'v1', 'g1', { faces: ['a'] })).not.toThrow();
  });
  it('JSON corrupto o con forma ajena se ignora', () => {
    const storage = fakeStorage();
    const key = 'biblioshare:atlas:v1:g1';
    storage.data.set(key, '{no es json');
    expect(readGroupMemory(storage, 'v1', 'g1')).toEqual({ faces: null, camera: null });
    storage.data.set(key, JSON.stringify({ faces: [1, 2], camera: { lens: 'mapa', x: 0, y: 0, k: 1 } }));
    expect(readGroupMemory(storage, 'v1', 'g1')).toEqual({ faces: null, camera: null });
    storage.data.set(key, JSON.stringify({ faces: 'a', camera: { lens: 'quien', x: 'x', y: 0, k: 0 } }));
    expect(readGroupMemory(storage, 'v1', 'g1')).toEqual({ faces: null, camera: null });
    storage.data.set(key, 'null');
    expect(readGroupMemory(storage, 'v1', 'g1')).toEqual({ faces: null, camera: null });
    // Writing over garbage starts a clean record.
    writeGroupMemory(storage, 'v1', 'g1', { faces: ['a'] });
    expect(readGroupMemory(storage, 'v1', 'g1')).toEqual({ faces: ['a'], camera: null });
  });
});

describe('memoria por cuenta', () => {
  it('el mismo par sin guardar no se cruza entre cuentas de la misma pestaña', () => {
    const storage = fakeStorage();
    writeGroupMemory(storage, 'v1', 'with:p', { faces: ['v1', 'p'], camera: { lens: 'quien', x: 1, y: 2, k: 1 } });
    expect(readGroupMemory(storage, 'v2', 'with:p')).toEqual({ faces: null, camera: null });
    expect(readGroupMemory(storage, 'v1', 'with:p').faces).toEqual(['v1', 'p']);
  });
  it('clearAtlasMemory borra todo lo del atlas, de cualquier cuenta, y nada más', () => {
    const storage = fakeStorage();
    writeGroupMemory(storage, 'v1', 'g1', { faces: ['a'] });
    writeGroupMemory(storage, 'v2', 'with:p', { faces: ['b'] });
    storage.setItem('otra:cosa', '1');
    clearAtlasMemory(storage);
    expect([...storage.data.keys()]).toEqual(['otra:cosa']);
  });
  it('clearAtlasMemory tolera un storage que lanza o que no existe', () => {
    expect(() => clearAtlasMemory(throwing)).not.toThrow();
    expect(() => clearAtlasMemory(null)).not.toThrow();
  });
});
