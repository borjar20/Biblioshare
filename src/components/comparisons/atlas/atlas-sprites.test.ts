import { expect, it } from 'vitest';
import type { Cluster } from '@/lib/comparisons/atlas/layout';
import { movingClusters, type Sprite } from './atlas-sprites';

it('los rótulos y halos siguen el desplazamiento medio de sus obras al reagruparse', () => {
  const cluster: Cluster = { id: 'a,b', owners: ['a', 'b'], keys: ['book:1', 'book:2'], x: 100, y: 200, r: 30 };
  const sprites = new Map<string, Sprite>([
    ['book:1', { x: 0, y: 30, tx: 100, ty: 200 } as Sprite],
    ['book:2', { x: 40, y: 50, tx: 120, ty: 220 } as Sprite],
  ]);
  expect(movingClusters([cluster], sprites)[0]).toMatchObject({ x: 10, y: 30, keys: cluster.keys });
  for (const sprite of sprites.values()) { sprite.x = sprite.tx; sprite.y = sprite.ty; }
  expect(movingClusters([cluster], sprites)).toEqual([cluster]);
});

it('mantiene el centro de un grupo cuando sus sprites todavía no existen', () => {
  const cluster: Cluster = { id: 'a,b', owners: ['a', 'b'], keys: ['book:1'], x: 100, y: 200, r: 30 };
  expect(movingClusters([cluster], new Map())).toEqual([cluster]);
});
