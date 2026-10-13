// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import { atlasModel } from '@/lib/comparisons/atlas/model';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { layoutOpinion } from '@/lib/comparisons/atlas/opinion';
import { buildScene } from '@/lib/comparisons/atlas/scene';
import { fit } from '@/lib/comparisons/atlas/camera';
import { AtlasCanvas } from './atlas-canvas';

const snapshot: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: ['a', 'b'].map(id => ({ slotId: id, userId: id, name: id, avatarUrl: null, available: true })) },
  format: 'all', excludedSeriesWithoutEpisodes: 0, catalog: [],
  works: ['a', 'b'].map(userId => ({ userId, key: 'book:1' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null })) };
const { people, works } = atlasModel(snapshot, 'a', 'Tú');
const layout = layoutQuien(people, works);
const scene = buildScene('quien', works, ['a', 'b'], layout, layoutOpinion(people, works, ['a', 'b']));
let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(600);
  // Older jsdom lacks PointerEvent; without it fireEvent drops clientX/pointerType.
  if (!('PointerEvent' in window)) vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? ''; }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const flush = () => act(() => { for (let i = 0; i < 400 && frames.length; i++) frames.shift()!(performance.now()); });

describe('AtlasCanvas', () => {
  it('se asienta, publica la sonda y tocar un polo alterna esa cara', () => {
    const toggle = vi.fn();
    const { container } = render(<AtlasCanvas label="Mapa" people={people} works={works} active={['a', 'b']} scene={scene} quien={layout}
      countLabel={n => `${n} obras`} onTogglePerson={toggle} onHover={() => {}} onActivate={() => {}}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    expect(host.dataset.atlasMoving).toBe('false');
    expect(JSON.parse(host.dataset.atlasProbe!)).toEqual([expect.objectContaining({ key: 'book:1' })]);
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
    const k = Number(host.dataset.atlasZoom);
    // First pole («Tú») sits on the left with two people.
    const x = (layout.poles[0].x - (layout.extent.minX + layout.extent.maxX) / 2) * k + 400;
    const y = (layout.poles[0].y - (layout.extent.minY + layout.extent.maxY) / 2) * k + 300;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse' });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse' });
    expect(toggle).toHaveBeenCalledWith('a');
  });

  function setup() {
    const toggle = vi.fn();
    const { container } = render(<AtlasCanvas label="Mapa" people={people} works={works} active={['a', 'b']} scene={scene} quien={layout}
      countLabel={n => `${n} obras`} onTogglePerson={toggle} onHover={() => {}} onActivate={() => {}}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
    return { toggle, host, canvas };
  }

  it('durante un arrastre informa de movimiento y publica la sonda al soltar', () => {
    const { host, canvas } = setup();
    delete host.dataset.atlasProbe;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'mouse' });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 130, clientY: 100, pointerType: 'mouse' });
    flush();
    expect(host.dataset.atlasMoving).toBe('true');
    expect(host.dataset.atlasProbe).toBeUndefined();
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 130, clientY: 100, pointerType: 'mouse' });
    flush();
    expect(host.dataset.atlasMoving).toBe('false');
    expect(JSON.parse(host.dataset.atlasProbe!)).toBeInstanceOf(Array);
  });

  it('ignora el botón derecho del ratón en un polo', () => {
    const { toggle, host, canvas } = setup();
    const k = Number(host.dataset.atlasZoom);
    const x = (layout.poles[0].x - (layout.extent.minX + layout.extent.maxX) / 2) * k + 400;
    const y = (layout.poles[0].y - (layout.extent.minY + layout.extent.maxY) / 2) * k + 300;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 2 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 2 });
    expect(toggle).not.toHaveBeenCalled();
  });

  it('doble clic sobre un polo no hace zoom (el clic ya alterna la cara)', () => {
    const { toggle, host, canvas } = setup();
    const k = Number(host.dataset.atlasZoom);
    const x = (layout.poles[0].x - (layout.extent.minX + layout.extent.maxX) / 2) * k + 400;
    const y = (layout.poles[0].y - (layout.extent.minY + layout.extent.maxY) / 2) * k + 300;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse' });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse' });
    fireEvent.doubleClick(canvas, { clientX: x, clientY: y });
    flush();
    expect(toggle).toHaveBeenCalledWith('a');
    expect(Number(host.dataset.atlasZoom)).toBe(k);
  });

  const props = { label: 'Mapa', people, works, active: ['a', 'b'], scene, quien: layout, countLabel: (n: number) => `${n} obras`,
    onTogglePerson: () => {}, onHover: () => {}, onActivate: () => {} };
  const fitZoom = (width: number, height: number, top: number, bottom: number) =>
    fit(layout.extent, { width, height }, { x: 32, y: top + bottom + 24 }).k.toFixed(3);
  const oneFrame = () => act(() => { const pending = frames; frames = []; for (const cb of pending) cb(performance.now()); });

  it('si los márgenes llegan antes de tocar nada, la cámara salta al nuevo encaje sin planear', () => {
    // Wide viewport so that the vertical band is the one that limits once the overlays grow.
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1600);
    const { container, rerender } = render(<AtlasCanvas {...props} insets={{ top: 40, bottom: 40 }}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    expect(host.dataset.atlasZoom).toBe(fitZoom(1600, 600, 40, 40));
    rerender(<AtlasCanvas {...props} insets={{ top: 200, bottom: 120 }}/>);
    expect(fitZoom(1600, 600, 200, 120)).not.toBe(fitZoom(1600, 600, 40, 40));
    oneFrame();
    expect(host.dataset.atlasZoom).toBe(fitZoom(1600, 600, 200, 120));
  });

  it('al redimensionar reencaja si la cámara seguía en el encaje, y no si el usuario la movió', () => {
    let observed: () => void = () => {};
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { observed = cb; } observe() {} disconnect() {} });
    const { container } = render(<AtlasCanvas {...props} insets={{ top: 40, bottom: 40 }}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(360);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(700);
    act(() => observed());
    oneFrame();
    expect(host.dataset.atlasZoom).toBe(fitZoom(360, 700, 40, 40));
    fireEvent.wheel(canvas, { deltaY: -200, clientX: 100, clientY: 100 });
    flush();
    const moved = host.dataset.atlasZoom;
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(800);
    act(() => observed());
    flush();
    expect(host.dataset.atlasZoom).toBe(moved);
  });

  it('en Opinión no hay polos que tocar y la sonda solo trae lo comparable', () => {
    const rated: Snapshot = { ...snapshot, works: snapshot.works.map(w => ({ ...w, rating: 8 })) };
    const model = atlasModel(rated, 'a', 'Tú'); const quien = layoutQuien(model.people, model.works);
    const opinion = layoutOpinion(model.people, model.works, ['a', 'b']);
    const opinionScene = buildScene('opinion', model.works, ['a', 'b'], quien, opinion);
    const toggle = vi.fn();
    const labels = { axisRef: 'x', axisOthers: 'y', loved: 'l', meh: 'm', refYes: 'r', othersYes: 'o' };
    const { container } = render(<AtlasCanvas label="Mapa" people={model.people} works={model.works} active={['a', 'b']} scene={opinionScene} quien={quien}
      opinionLabels={labels} countLabel={n => `${n}`} onTogglePerson={toggle} onHover={() => {}} onActivate={() => {}}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    expect(JSON.parse(host.dataset.atlasProbe!).map((p: { key: string }) => p.key)).toEqual(['book:1']);
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
    const k = Number(host.dataset.atlasZoom);
    const x = (quien.poles[0].x - 0) * k + 400, y = (quien.poles[0].y - 0) * k + 300;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });
    expect(toggle).not.toHaveBeenCalled();
  });
});
