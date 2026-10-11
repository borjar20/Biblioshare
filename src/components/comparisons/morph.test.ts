import { describe, expect, it } from 'vitest';
import { morphCircle, morphLayers, overshoot, phase, regionEntry } from './morph';
import { sampleMotion } from './motion';
import type { Scene } from './geometry';

describe('map → Venn morph (#1497)', () => {
  it('is the map at 0 and the Venn at 1, in both directions', () => {
    expect(morphLayers(0)).toMatchObject({ circle: 0, map: 1, travel: 0, avatar: 1, label: 0, link: 1 });
    expect(morphLayers(1)).toMatchObject({ circle: 1, map: 0, travel: 1, avatar: 0, label: 1, link: 0 });
  });
  it('orders the sequence: the group leaves before names arrive', () => {
    const middle = morphLayers(.5);
    expect(middle.map).toBe(0);
    expect(middle.label).toBe(0);
    expect(middle.circle).toBeGreaterThan(0);
    expect(phase(.5, .6, .8)).toBe(0);
  });
  it('grows an avatar disc into its exact circle, with a small overshoot on the way', () => {
    const avatar = { x: 500, y: 60, radius: 44 }; const venn = { x: 370, y: 420, radius: 290 };
    expect(morphCircle(avatar, venn, 0)).toEqual(avatar);
    expect(morphCircle(avatar, venn, 1)).toEqual(venn);
    // Size follows the travel (no ballooning in place) and swells just before landing.
    expect(morphCircle(avatar, venn, .25).radius).toBeCloseTo(44 + (290 - 44) * .25);
    expect(morphCircle(avatar, venn, .85).radius).toBeGreaterThan(44 + (290 - 44) * .85);
    expect(overshoot(0)).toBe(0); expect(overshoot(1)).toBe(1);
    expect(Math.max(...Array.from({ length: 50 }, (_, index) => overshoot(index / 50)))).toBeGreaterThan(1);
  });
  it('staggers region counters and counts each up to its real value', () => {
    expect(regionEntry(.6, 0, 32)).toMatchObject({ t: 0, shown: 0 });
    expect(regionEntry(.7, 0, 32).t).toBeGreaterThan(regionEntry(.7, 1, 0).t);
    expect(regionEntry(.7, 0, 32).shown).toBeGreaterThan(0);
    for (const index of [0, 1, 2, 6]) expect(regionEntry(1, index, 32)).toMatchObject({ t: 1, scale: 1, shown: 32 });
  });
  it('shares the camera clock, so a return or interruption continues from what is shown', () => {
    const map: Scene = { camera: { x: 0, y: 0, scale: .6 }, height: 558, poses: {}, morph: 0 };
    const venn: Scene = { ...map, height: 540, morph: 1 };
    const half = sampleMotion(map, venn, 425, 850);
    expect(half.morph).toBe(.5);
    expect(sampleMotion(half, map, 0, 850).morph).toBe(.5);
    expect(sampleMotion(half, map, 850, 850).morph).toBe(0);
    expect(sampleMotion(map, venn, 212, 850).morph).toBeCloseTo(1 - sampleMotion(venn, map, 212, 850).morph!);
  });
});
