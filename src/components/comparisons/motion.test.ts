// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCamera } from './use-camera';
import type { Scene } from './geometry';
import { sampleMotion } from './motion';
const start: Scene = { camera: { x: 0, y: 0, scale: .5 }, height: 450, poses: { 'book:a': { x: 100, y: 200, width: 60, height: 87, rotate: -5 } } };
const end: Scene = { camera: { x: -200, y: -100, scale: 1 }, height: 900, poses: { 'book:a': { x: 400, y: 500, width: 120, height: 174, rotate: 0 } } };
describe('guided motion', () => {
  it('has exact endpoints and a real intermediate camera, height and cover', () => {
    expect(sampleMotion(start, end, 0, 720)).toEqual(start);
    expect(sampleMotion(start, end, 720, 720)).toEqual(end);
    const visible = sampleMotion(start, end, 360, 720);
    expect(visible.camera).not.toEqual(start.camera); expect(visible.camera).not.toEqual(end.camera);
    expect(visible.height).toBe(675);
    expect(visible.poses['book:a']).not.toEqual(start.poses['book:a']);
    expect(visible.poses['book:a']).not.toEqual(end.poses['book:a']);
  });
  it('reverses symmetrically and rebases interruption on the displayed frame', () => {
    expect(sampleMotion(start, end, 180, 720)).toEqual(sampleMotion(end, start, 540, 720));
    const visible = sampleMotion(start, end, 360, 720);
    expect(sampleMotion(visible, start, 0, 720)).toEqual(visible);
    expect(sampleMotion(visible, start, 720, 720)).toEqual(start);
  });
  it('keeps incoming and outgoing cover poses while travelling, handles direct reduced motion', () => {
    const next = { ...end, poses: { ...end.poses, 'book:b': end.poses['book:a'] } };
    expect(sampleMotion(start, next, 200, 850).poses['book:b']).toEqual(end.poses['book:a']);
    expect(sampleMotion(next, start, 200, 850).poses['book:b']).toEqual(end.poses['book:a']);
    expect(sampleMotion(start, end, 0, 0)).toEqual(end);
  });
});
describe('camera clock and lifecycle', () => {
  let frames: Map<number, FrameRequestCallback>; let id: number; let now: number;
  beforeEach(() => {
    frames = new Map(); id = 0; now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function tick(time: number) {
    now = time; const pending = [...frames.values()]; frames.clear();
    act(() => pending.forEach(callback => callback(now)));
  }
  it('has one frame, rebases interruptions at the displayed scene, and cancels on unmount', () => {
    const hook = renderHook(({ scene }) => useCamera(scene, 'level', false), { initialProps: { scene: start } });
    expect(frames.size).toBe(0);
    hook.rerender({ scene: end }); expect(frames.size).toBe(1);
    tick(360); const visible = hook.result.current;
    expect(visible).toEqual(sampleMotion(start, end, 360, 720));
    hook.rerender({ scene: start }); expect(frames.size).toBe(1); expect(hook.result.current).toBe(visible);
    tick(540); expect(hook.result.current).toEqual(sampleMotion(visible, start, 180, 720));
    hook.unmount(); expect(frames.size).toBe(0);
  });
  it('completes at850ms for group, does not restart for unchanged destinations and reduces directly', () => {
    const hook = renderHook(({ scene, reduced }) => useCamera(scene, 'group', reduced), { initialProps: { scene: start, reduced: false } });
    hook.rerender({ scene: end, reduced: false }); tick(720); expect(hook.result.current).not.toEqual(end);
    hook.rerender({ scene: end, reduced: false }); tick(850); expect(hook.result.current).toBe(end); expect(frames.size).toBe(0);
    hook.rerender({ scene: start, reduced: true }); expect(hook.result.current).toBe(start); expect(frames.size).toBe(0);
  });
});
