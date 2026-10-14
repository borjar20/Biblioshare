import { describe, expect, it, vi } from 'vitest';
import { createImageCache, type ImageLike } from './image-cache';

function fakes() {
  const made: ImageLike[] = [];
  return { made, create: () => { const img: ImageLike = { src: '', onload: null, onerror: null }; made.push(img); return img; } };
}

describe('createImageCache', () => {
  it('pide con el loader a 96 px, una sola vez por portada, y solo devuelve las cargadas', () => {
    const { made, create } = fakes(); const onReady = vi.fn();
    const cache = createImageCache({ create, resolve: src => `${src}?w=96`, onReady });
    cache.request('a'); cache.request('a');
    expect(made).toHaveLength(1); expect(made[0].src).toBe('a?w=96');
    expect(cache.get('a')).toBeNull();
    made[0].onload!(); expect(onReady).toHaveBeenCalledTimes(1);
    expect(cache.get('a')).toBe(made[0]);
  });
  it('una portada que falla no se devuelve ni se repide', () => {
    const { made, create } = fakes();
    const cache = createImageCache({ create, resolve: s => s, onReady: () => {} });
    cache.request('x'); made[0].onerror!(); cache.request('x');
    expect(made).toHaveLength(1); expect(cache.get('x')).toBeNull();
  });
  it('LRU: por encima de la capacidad desaloja la menos usada y la desengancha', () => {
    const { made, create } = fakes();
    const cache = createImageCache({ capacity: 2, create, resolve: s => s, onReady: () => {} });
    cache.request('a'); cache.request('b'); made[0].onload!(); made[1].onload!();
    cache.get('a');                 // a is now the most recent
    cache.request('c');             // evicts b
    expect(cache.size()).toBe(2);
    expect(cache.get('b')).toBeNull(); expect(cache.get('a')).toBe(made[0]);
    expect(made[1]).toMatchObject({ src: '', onload: null, onerror: null });
  });
});
