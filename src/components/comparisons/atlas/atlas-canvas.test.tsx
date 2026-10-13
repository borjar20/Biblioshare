// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import { atlasModel } from '@/lib/comparisons/atlas/model';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { AtlasCanvas } from './atlas-canvas';

const snapshot: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: ['a', 'b'].map(id => ({ slotId: id, userId: id, name: id, avatarUrl: null, available: true })) },
  format: 'all', excludedSeriesWithoutEpisodes: 0, catalog: [],
  works: ['a', 'b'].map(userId => ({ userId, key: 'book:1' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null })) };
const { people, works } = atlasModel(snapshot, 'a', 'Tú');
const layout = layoutQuien(people, works);
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
    const { container } = render(<AtlasCanvas label="Mapa" people={people} works={works} active={['a', 'b']} layout={layout}
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
    const { container } = render(<AtlasCanvas label="Mapa" people={people} works={works} active={['a', 'b']} layout={layout}
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
});
