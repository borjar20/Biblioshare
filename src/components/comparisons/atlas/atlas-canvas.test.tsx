// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import { atlasModel } from '@/lib/comparisons/atlas/model';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { layoutOpinion } from '@/lib/comparisons/atlas/opinion';
import { layoutTiempo } from '@/lib/comparisons/atlas/tiempo';
import { layoutIslands } from '@/lib/comparisons/atlas/islands';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import { buildScene, type Lens } from '@/lib/comparisons/atlas/scene';
import { fit } from '@/lib/comparisons/atlas/camera';
import { createRef } from 'react';
import { AtlasCanvas, type AtlasCanvasHandle } from './atlas-canvas';

const snapshot: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: ['a', 'b'].map(id => ({ slotId: id, userId: id, name: id, avatarUrl: null, available: true })) },
  format: 'all', excludedSeriesWithoutEpisodes: 0, catalog: [],
  works: ['a', 'b'].map(userId => ({ userId, key: 'book:1' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null })) };
const { people, works } = atlasModel(snapshot, 'a', 'Tú');
const layout = layoutQuien(people, works);
const sceneFor = (lens: Lens, list: AtlasPerson[], items: AtlasWork[], active: string[]) => buildScene(lens, items, active, {
  quien: layoutQuien(list, items), opinion: layoutOpinion(list, items, active),
  tiempo: layoutTiempo(list, items, active), islas: layoutIslands(list, items, active, 'type') });
const scene = sceneFor('quien', people, works, ['a', 'b']);
const tiempoLayout = layoutTiempo(people, works, ['a', 'b']), islasLayout = layoutIslands(people, works, ['a', 'b'], 'type');
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
    const { container } = render(<AtlasCanvas label="Mapa" people={people} works={works} active={['a', 'b']} scene={scene} quien={layout} tiempo={tiempoLayout} islas={islasLayout}
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
    const { container } = render(<AtlasCanvas label="Mapa" people={people} works={works} active={['a', 'b']} scene={scene} quien={layout} tiempo={tiempoLayout} islas={islasLayout}
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

  const props = { label: 'Mapa', people, works, active: ['a', 'b'], scene, quien: layout, tiempo: tiempoLayout, islas: islasLayout, countLabel: (n: number) => `${n} obras`,
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
    const opinionScene = sceneFor('opinion', model.people, model.works, ['a', 'b']);
    const toggle = vi.fn();
    const labels = { axisRef: 'x', axisOthers: 'y', loved: 'l', meh: 'm', refYes: 'r', othersYes: 'o' };
    const { container } = render(<AtlasCanvas label="Mapa" people={model.people} works={model.works} active={['a', 'b']} scene={opinionScene} quien={quien}
      tiempo={layoutTiempo(model.people, model.works, ['a', 'b'])} islas={layoutIslands(model.people, model.works, ['a', 'b'], 'type')}
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

  it('en Tiempo la sonda trae cada obra una vez; al volver a Quién la aparición extra se desvanece antes de borrarse', () => {
    const dated: Snapshot = { ...snapshot, works: snapshot.works.map((w, i) => ({ ...w, date: i ? '2025-06-10' : '2024-03-01' })) };
    const model = atlasModel(dated, 'a', 'Tú'); const quien = layoutQuien(model.people, model.works);
    const tiempo = sceneFor('tiempo', model.people, model.works, ['a', 'b']);
    expect([...tiempo.targets.keys()]).toEqual(['book:1', 'book:1@b']);
    const base = { label: 'Mapa', people: model.people, works: model.works, active: ['a', 'b'], quien, tiempo: layoutTiempo(model.people, model.works, ['a', 'b']), islas: layoutIslands(model.people, model.works, ['a', 'b'], 'type'), countLabel: (n: number) => `${n}`,
      onTogglePerson: () => {}, onHover: () => {}, onActivate: () => {} };
    const { container, rerender } = render(<AtlasCanvas {...base} scene={tiempo}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    expect(host.dataset.atlasMoving).toBe('false');
    expect(host.dataset.atlasSprites).toBe('2');
    expect(JSON.parse(host.dataset.atlasProbe!).map((p: { key: string }) => p.key)).toEqual(['book:1']);
    rerender(<AtlasCanvas {...base} scene={sceneFor('quien', model.people, model.works, ['a', 'b'])}/>);
    oneFrame();
    expect(host.dataset.atlasSprites).toBe('2');   // the extra is fading back, not deleted at once
    flush();
    expect(host.dataset.atlasMoving).toBe('false');
    expect(host.dataset.atlasSprites).toBe('1');
    expect(JSON.parse(host.dataset.atlasProbe!).map((p: { key: string }) => p.key)).toEqual(['book:1']);
  });
  it('las portadas reales solo se piden con zoom de portada y se publican en data-atlas-covers', () => {
    const noop = () => {};
    const fakeCtx = new Proxy({} as Record<string, unknown>, {
      get: (target, prop: string) => prop === 'measureText' ? () => ({ width: 1 }) : prop in target ? target[prop] : noop,
      set: (target, prop: string, value) => { target[prop] = value; return true; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    const created: { src: string }[] = [];
    vi.stubGlobal('Image', class { src = ''; onload = null; onerror = null; decoding = ''; constructor() { created.push(this); } });
    const withCover = works.map(work => ({ ...work, coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg' }));
    const { container } = render(<AtlasCanvas {...props} works={withCover}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    expect(host.dataset.atlasCovers).toBe('0');
    expect(created).toHaveLength(0);
    const canvas = container.querySelector('canvas')!;
    for (let i = 0; i < 12; i++) fireEvent.wheel(canvas, { deltaY: -400, clientX: 400, clientY: 300 });
    flush();
    expect(Number(host.dataset.atlasZoom)).toBeGreaterThan(1.1);
    expect(Number(host.dataset.atlasCovers)).toBeGreaterThan(0);
    expect(created.length).toBeGreaterThan(0);
    expect(created[0].src).toContain('1-S.jpg');
  });
  describe('gestos', () => {
    const poleScreen = (host: HTMLElement) => {
      const k = Number(host.dataset.atlasZoom);
      return { x: (layout.poles[0].x - (layout.extent.minX + layout.extent.maxX) / 2) * k + 400,
        y: (layout.poles[0].y - (layout.extent.minY + layout.extent.maxY) / 2) * k + 300 };
    };

    it('la rueda respeta deltaMode: líneas × 16 px y páginas × alto del viewport', () => {
      const { host, canvas } = setup();
      const k0 = Number(host.dataset.atlasZoom);
      fireEvent.wheel(canvas, { deltaY: 5, deltaMode: 1, clientX: 400, clientY: 300 });
      flush();
      const k1 = Number(host.dataset.atlasZoom);
      expect(k1 / k0).toBeCloseTo(Math.exp(-5 * 16 * 0.0018), 2);
      fireEvent.wheel(canvas, { deltaY: -0.5, deltaMode: 2, clientX: 400, clientY: 300 });
      flush();
      expect(Number(host.dataset.atlasZoom) / k1).toBeCloseTo(Math.exp(0.5 * 600 * 0.0018), 2);
    });

    it('un toque exige que el recorrido máximo sea < 5 px, aunque vuelva al punto de partida', () => {
      const { toggle, host, canvas } = setup();
      const { x, y } = poleScreen(host);
      fireEvent.pointerDown(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'touch' });
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: x + 20, clientY: y, pointerType: 'touch' });
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'touch' });
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: x, clientY: y, pointerType: 'touch' });
      expect(toggle).not.toHaveBeenCalled();
      // A small wobble is still a tap.
      fireEvent.pointerDown(canvas, { pointerId: 2, clientX: x, clientY: y, pointerType: 'touch' });
      fireEvent.pointerMove(canvas, { pointerId: 2, clientX: x + 3, clientY: y, pointerType: 'touch' });
      fireEvent.pointerUp(canvas, { pointerId: 2, clientX: x + 3, clientY: y, pointerType: 'touch' });
      expect(toggle).toHaveBeenCalledWith('a');
    });

    it('durante el pellizco el punto medio también desplaza', () => {
      const { host, canvas } = setup();
      const before = JSON.parse(host.dataset.atlasProbe!)[0];
      const k = host.dataset.atlasZoom;
      fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 300, clientY: 300, pointerType: 'touch' });
      fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 500, clientY: 300, pointerType: 'touch' });
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 350, clientY: 340, pointerType: 'touch' });
      fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 550, clientY: 340, pointerType: 'touch' });
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 350, clientY: 340, pointerType: 'touch' });
      fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 550, clientY: 340, pointerType: 'touch' });
      flush();
      expect(host.dataset.atlasZoom).toBe(k);
      expect(JSON.parse(host.dataset.atlasProbe!)[0]).toEqual({ key: before.key, x: before.x + 50, y: before.y + 40 });
    });

    it('apoyar el dedo pide un frame', () => {
      const { host, canvas } = setup();
      expect(frames).toHaveLength(0);
      fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'touch' });
      expect(frames).toHaveLength(1);
      flush();
      expect(host.dataset.atlasMoving).toBe('true');
    });

    it('las obras siguen volando aunque haya un dedo quieto en el lienzo', () => {
      const dated: Snapshot = { ...snapshot, works: snapshot.works.map((w, i) => ({ ...w, date: i ? '2025-06-10' : '2024-03-01' })) };
      const model = atlasModel(dated, 'a', 'Tú'); const quien = layoutQuien(model.people, model.works);
      const base = { ...props, people: model.people, works: model.works, quien, tiempo: layoutTiempo(model.people, model.works, ['a', 'b']) };
      const { container, rerender } = render(<AtlasCanvas {...base} scene={sceneFor('quien', model.people, model.works, ['a', 'b'])}/>);
      flush();
      const canvas = container.querySelector('canvas')!;
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
      fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'touch' });
      flush();
      expect(frames).toHaveLength(0);
      rerender(<AtlasCanvas {...base} scene={sceneFor('tiempo', model.people, model.works, ['a', 'b'])}/>);
      oneFrame();
      expect(frames).toHaveLength(1);   // the works are still flying: the frame re-schedules itself
      flush();
      expect(frames).toHaveLength(0);   // and stops once they settle, finger or not
    });

    it('cambiar las personas redibuja', () => {
      const { container, rerender } = render(<AtlasCanvas {...props}/>);
      flush();
      expect(container.querySelector('canvas')).not.toBeNull();
      rerender(<AtlasCanvas {...props} people={people.map(person => ({ ...person, color: '#000000' }))}/>);
      expect(frames.length).toBeGreaterThan(0);
    });

    it('si el tope de peticiones por frame recorta portadas visibles, pide otro frame para el resto', () => {
      const noop = () => {};
      const fakeCtx = new Proxy({} as Record<string, unknown>, {
        get: (target, prop: string) => prop === 'measureText' ? () => ({ width: 1 }) : prop === 'createRadialGradient' ? () => ({ addColorStop: noop })
          : prop in target ? target[prop] : noop,
        set: (target, prop: string, value) => { target[prop] = value; return true; },
      });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
      const created: { src: string }[] = [];
      vi.stubGlobal('Image', class { src = ''; onload = null; onerror = null; decoding = ''; constructor() { created.push(this); } });
      const many: AtlasWork[] = Array.from({ length: 80 }, (_, i) => ({ ...works[0], key: `book:${100 + i}` as WorkKey, itemId: String(100 + i),
        coverUrl: `https://covers.openlibrary.org/b/id/${i}-M.jpg` }));
      const quien = layoutQuien(people, many);
      const { container } = render(<AtlasCanvas {...props} works={many} quien={quien} scene={sceneFor('quien', people, many, ['a', 'b'])}/>);
      flush();
      const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
      const canvas = container.querySelector('canvas')!;
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
      const k0 = Number(host.dataset.atlasZoom);
      // One wheel step straight to cover zoom: a single frame follows it, which may request only 24 covers.
      fireEvent.wheel(canvas, { deltaY: -Math.log(1.3 / k0) / 0.0018, clientX: 400, clientY: 300 });
      flush();
      expect(Number(host.dataset.atlasZoom)).toBeGreaterThan(1.1);
      expect(created.length).toBeGreaterThan(24);
    });
  });
  describe('teclado y cámara recordada', () => {
    const withHandle = (extra: Partial<Parameters<typeof AtlasCanvas>[0]> = {}) => {
      const handle = createRef<AtlasCanvasHandle>();
      const utils = render(<AtlasCanvas {...props} ref={handle} {...extra}/>);
      flush();
      return { handle, host: utils.container.querySelector<HTMLElement>('[data-atlas-moving]')!, canvas: utils.container.querySelector('canvas')!, ...utils };
    };
    it('el lienzo entra en el orden de tabulación y anuncia sus atajos', () => {
      const { canvas } = withHandle();
      expect(canvas.tabIndex).toBe(0);
      expect(canvas.getAttribute('aria-keyshortcuts')).toBe('+ - 0 F ArrowUp ArrowDown ArrowLeft ArrowRight 1 2 3 4');
    });
    it('camera() da la cámara actual con su lente y panBy la mueve hacia donde apunta', () => {
      const { handle } = withHandle();
      const before = handle.current!.camera()!;
      expect(before).toEqual({ lens: 'quien', x: expect.any(Number), y: expect.any(Number), k: expect.any(Number) });
      act(() => handle.current!.panBy(80, -40));
      flush();
      const after = handle.current!.camera()!;
      expect(after.k).toBeCloseTo(before.k, 6);
      expect(after.x).toBeCloseTo(before.x + 80 / before.k, 3);
      expect(after.y).toBeCloseTo(before.y - 40 / before.k, 3);
    });
    it('al asentarse avisa con la cámara; un pan es del usuario y un cambio de márgenes no lo deshace', () => {
      const onSettled = vi.fn();
      const { handle, rerender } = withHandle({ onSettled, insets: { top: 40, bottom: 40 } });
      expect(onSettled).toHaveBeenLastCalledWith({ lens: 'quien', ...pick(handle.current!.camera()!) });
      act(() => handle.current!.panBy(0, 80));
      flush();
      const moved = handle.current!.camera();
      expect(onSettled).toHaveBeenLastCalledWith(moved);
      rerender(<AtlasCanvas {...props} ref={handle} onSettled={onSettled} insets={{ top: 200, bottom: 120 }}/>);
      flush();
      expect(handle.current!.camera()).toEqual(moved);
    });
    it('con initialCamera arranca en ella, sin encajar, y los márgenes no la mueven', () => {
      const initialCamera = { x: 12, y: -7, k: 2.5 };
      const { handle, host, rerender } = withHandle({ initialCamera, insets: { top: 40, bottom: 40 } });
      expect(handle.current!.camera()).toEqual({ lens: 'quien', ...initialCamera });
      expect(host.dataset.atlasZoom).toBe('2.500');
      rerender(<AtlasCanvas {...props} ref={handle} initialCamera={initialCamera} insets={{ top: 200, bottom: 120 }}/>);
      flush();
      expect(handle.current!.camera()).toEqual({ lens: 'quien', ...initialCamera });
      // «Encajar» still works from there.
      act(() => handle.current!.fit());
      flush();
      expect(host.dataset.atlasZoom).toBe(fitZoom(800, 600, 200, 120));
    });
  });
});
const pick = ({ x, y, k }: { x: number; y: number; k: number }) => ({ x, y, k });
