import { describe, expect, it } from 'vitest';
import { nearest } from './hit';

describe('nearest', () => {
  it('devuelve el más cercano dentro del radio, o null', () => {
    const items = [{ x: 0, y: 0, id: 'a' }, { x: 5, y: 0, id: 'b' }];
    expect(nearest(items, { x: 4, y: 0 }, 3)?.id).toBe('b');
    expect(nearest(items, { x: 40, y: 0 }, 3)).toBeNull();
  });
});
