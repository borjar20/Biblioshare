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
import { buildScene, type Lens, type SceneTarget } from '@/lib/comparisons/atlas/scene';
import { fit } from '@/lib/atlas/camera';
import { Activity, createRef } from 'react';
import { AtlasCanvas, type AtlasCanvasHandle } from './atlas-canvas';
import { paintIslasBack } from './paint-islas';
import type { PaintView, Palette } from './atlas-palette';

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
  it('recupera una cámara de Quién tras cambiar la selección en la lista sin perder zoom', () => {
    const handle = createRef<AtlasCanvasHandle>();
    const selected = ['a'], quien = layoutQuien(people, works, selected);
    const next = buildScene('quien', works, selected, { quien, opinion: layoutOpinion(people, works, selected),
      tiempo: layoutTiempo(people, works, selected), islas: layoutIslands(people, works, selected, 'type') });
    const { container } = render(<AtlasCanvas ref={handle} label="Mapa" people={people} works={works} active={selected} scene={next} quien={quien}
      tiempo={tiempoLayout} islas={islasLayout} initialCamera={{ x: 0, y: 0, k: 2.8 }} countLabel={String}
      onTogglePerson={() => {}} onHover={() => {}} onActivate={() => {}}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    expect(handle.current!.camera()!.k).toBeCloseTo(2.8);
    expect(JSON.parse(host.dataset.atlasProbe!)).toEqual([expect.objectContaining({ key: 'book:1' })]);
  });
  it('sigue el grupo al cambiar selección cuando sale de la cámara propia, conservando el zoom', () => {
    const handle = createRef<AtlasCanvasHandle>();
    const props = { label: 'Mapa', people, works, active: ['a', 'b'], scene, quien: layout, tiempo: tiempoLayout, islas: islasLayout,
      countLabel: (n: number) => `${n} obras`, onTogglePerson: () => {}, onHover: () => {}, onActivate: () => {}, initialCamera: { x: 0, y: 0, k: 2.8 } };
    const { container, rerender } = render(<AtlasCanvas {...props} ref={handle}/>);
    flush();
    const selected = ['a'], quien = layoutQuien(people, works, selected);
    const next = buildScene('quien', works, selected, { quien, opinion: layoutOpinion(people, works, selected),
      tiempo: layoutTiempo(people, works, selected), islas: layoutIslands(people, works, selected, 'type') });
    rerender(<AtlasCanvas {...props} ref={handle} active={selected} quien={quien} scene={next}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    expect(handle.current!.camera()!.k).toBeCloseTo(2.8);
    expect(JSON.parse(host.dataset.atlasProbe!)).toEqual([expect.objectContaining({ key: 'book:1' })]);
  });
  it('redibuja al señalar una obra sin cambiar escena ni cámara', () => {
    const props = { label: 'Mapa', people, works, active: ['a', 'b'], scene, quien: layout, tiempo: tiempoLayout, islas: islasLayout,
      countLabel: (n: number) => `${n} obras`, onTogglePerson: () => {}, onHover: () => {}, onActivate: () => {} };
    const { container, rerender } = render(<AtlasCanvas {...props}/>);
    flush();
    const host = container.querySelector<HTMLElement>('[data-atlas-moving]')!;
    const before = host.dataset.atlasZoom;
    expect(frames).toHaveLength(0);
    rerender(<AtlasCanvas {...props} focusedKey="book:1"/>);
    expect(frames.length).toBeGreaterThan(0);
    flush();
    expect(host.dataset.atlasZoom).toBe(before);
    rerender(<AtlasCanvas {...props} focusedKey={null}/>);
    expect(frames.length).toBeGreaterThan(0);
  });
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
    const fakeCtx = new Proxy({ createRadialGradient: () => ({ addColorStop: noop }) } as Record<string, unknown>, {
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
      oneFrame();
      expect(created).toHaveLength(24);
      flush();
      expect(Number(host.dataset.atlasZoom)).toBeGreaterThan(1.1);
      expect(created.length).toBeGreaterThan(24);
      expect(frames).toHaveLength(0);
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
      // The automatic fit is not the user's framing.
      expect(onSettled).toHaveBeenLastCalledWith({ lens: 'quien', ...pick(handle.current!.camera()!) }, false);
      act(() => handle.current!.panBy(0, 80));
      flush();
      const moved = handle.current!.camera();
      expect(onSettled).toHaveBeenLastCalledWith(moved, true);
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

  describe('cámara del usuario', () => {
    const withHandle = (extra: Partial<Parameters<typeof AtlasCanvas>[0]> = {}) => {
      const handle = createRef<AtlasCanvasHandle>();
      const utils = render(<AtlasCanvas {...props} ref={handle} {...extra}/>);
      flush();
      return { handle, ...utils };
    };
    const own = (onSettled: ReturnType<typeof vi.fn>) => onSettled.mock.lastCall![1];
    it('una cámara restaurada sigue siendo del usuario; «Encajar» la devuelve al encaje y deja de serlo', () => {
      const onSettled = vi.fn();
      const { handle } = withHandle({ onSettled, initialCamera: { x: 12, y: -7, k: 2.5 } });
      expect(own(onSettled)).toBe(true);
      act(() => handle.current!.fit()); flush();
      expect(own(onSettled)).toBe(false);
    });
    it('al volver atrás, <Activity> recrea el motor y la cámara inicial se lee entonces, no al renderizar', () => {
      // Back from a ficha the page is revealed, not re-rendered: the getter must see the camera saved while it was visible.
      const stored: { camera?: { x: number; y: number; k: number } } = {};
      const onSettled = vi.fn();
      const handle = createRef<AtlasCanvasHandle>();
      const at = (mode: 'visible' | 'hidden') => <Activity mode={mode}><AtlasCanvas {...props} ref={handle} onSettled={onSettled} initialCamera={() => stored.camera}/></Activity>;
      const { rerender } = render(at('visible')); flush();
      expect(own(onSettled)).toBe(false);
      const saved = stored.camera = { x: 12, y: -7, k: 2.5 };
      rerender(at('hidden')); flush();
      rerender(at('visible')); flush();
      expect(handle.current!.camera()).toEqual({ lens: 'quien', ...saved });
      expect(onSettled).toHaveBeenLastCalledWith({ lens: 'quien', ...saved }, true);
    });
    it('rueda, zoom y desplazamiento la hacen del usuario; una escena nueva reencaja y deja de serlo', () => {
      const onSettled = vi.fn();
      const { handle, container, rerender } = withHandle({ onSettled });
      expect(own(onSettled)).toBe(false);
      const canvas = container.querySelector('canvas')!;
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
      fireEvent.wheel(canvas, { deltaY: -100, clientX: 400, clientY: 300 }); flush();
      expect(own(onSettled)).toBe(true);
      const tiempoScene = sceneFor('tiempo', people, works, ['a', 'b']);
      rerender(<AtlasCanvas {...props} ref={handle} onSettled={onSettled} scene={tiempoScene}/>); flush();
      expect(own(onSettled)).toBe(false);
      act(() => handle.current!.zoomBy(1.4)); flush();
      expect(own(onSettled)).toBe(true);
    });
    it('al desmontarse no vuelve a avisar aunque quede un frame pendiente', () => {
      const onSettled = vi.fn();
      const { handle, unmount } = withHandle({ onSettled });
      act(() => handle.current!.panBy(40, 0));
      const calls = onSettled.mock.calls.length;
      unmount(); flush();
      expect(onSettled.mock.calls.length).toBe(calls);
    });
  });

  it('Islas en un móvil estrecho: el encaje deja los títulos de las islas bajo la fila de caras, no debajo', () => {
    // Like the QA fixture: 10 people, 30 books rated alike by all (a 4-high stack of faces), a film and a series.
    const ids = 'abcdefghij'.split('');
    const keys = [...Array.from({ length: 30 }, (_, i) => `book:${i + 1}`), 'movie:1', 'series:1'] as WorkKey[];
    const wide: Snapshot = { ...snapshot, group: { ...snapshot.group, members: ids.map(id => ({ slotId: id, userId: id, name: id, avatarUrl: null, available: true })) },
      works: ids.flatMap(userId => keys.map(key => ({ userId, key, rating: key.startsWith('book') ? 9 : null, date: null, orderUnknown: false, progress: null }))) };
    const model = atlasModel(wide, 'a', 'Tú');
    const islas = layoutIslands(model.people, model.works, ids, 'type');
    const islasScene = buildScene('islas', model.works, ids, { quien: layoutQuien(model.people, model.works),
      opinion: layoutOpinion(model.people, model.works, ids), tiempo: layoutTiempo(model.people, model.works, ids), islas });
    const width = 360, height = 740, insets = { top: 176, bottom: 175 };
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(height);
    const islandText = { title: () => 'Libros', common: (n: number) => `${n} en común` };
    const onSettled = vi.fn();
    render(<AtlasCanvas {...props} people={model.people} works={model.works} active={ids} scene={islasScene} islas={islas}
      islandText={islandText} insets={insets} onSettled={onSettled}/>);
    flush();
    const cam = pick(onSettled.mock.lastCall![0]);
    // Paint with the settled camera and read where the titles land (y is the baseline; the font size is in the font).
    const text = vi.fn<PaintView['text']>();
    const ctx = new Proxy({}, { get: (_, prop) => prop === 'measureText' ? () => ({ width: 1 }) : () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
    paintIslasBack({ ctx, cam, vp: { width, height }, palette: { font: 'sans', type: {} } as Palette, text }, { layout: islas, people: model.people, text: islandText });
    const titles = text.mock.calls.filter(([value]) => value === 'Libros');
    expect(titles).toHaveLength(islas.islands.length);
    const top = Math.min(...titles.map(([, , y, font]) => y - Number(/(\d+(?:\.\d+)?)px/.exec(font)![1])));
    expect(top).toBeGreaterThanOrEqual(insets.top);
    // And the discs still fit above the dock.
    const bottom = Math.max(...islas.islands.map(island => (island.y + island.r - cam.y) * cam.k + height / 2));
    expect(bottom).toBeLessThanOrEqual(height - insets.bottom);
  });
  it('usa el encaje responsive de Islas sin reservar la cabecera dos veces y conserva una cámara propia al repack', () => {
    const faces = Array.from({ length: 10 }, (_, i) => ({ ...people[0], id: `p${i}`, name: `Persona ${i}` })), ids = faces.map(face => face.id);
    const rated = Array.from({ length: 3 }, (_, i) => ({ ...works[0], key: `book:${i}` as WorkKey,
      genres: ['Aventura', 'Ciencia ficción', 'Drama', 'Fantasía'], owners: ids.map(userId => ({ userId, rating: 9, date: null })) }));
    const insets = { top: 176, bottom: 175 };
    const make = (width: number) => {
      const islas = layoutIslands(faces, rated, ids, 'genre', { viewport: { width, height: 740 }, insets });
      const quien = layoutQuien(faces, rated, ids), tiempo = layoutTiempo(faces, rated, ids);
      return { islas, quien, tiempo, scene: buildScene('islas', rated, ids, { quien, tiempo, islas, opinion: layoutOpinion(faces, rated, ids) }) };
    };
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(360);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(740);
    const initial = make(360), handle = createRef<AtlasCanvasHandle>();
    const base = { ...props, people: faces, works: rated, active: ids, insets, islandText: { title: () => 'Isla', common: (n: number) => `${n} en común` } };
    const { rerender } = render(<AtlasCanvas {...base} {...initial} ref={handle}/>);
    flush();
    expect(pick(handle.current!.camera()!)).toEqual(initial.islas.framing!.camera);
    act(() => handle.current!.panBy(80, 20)); flush();
    const ownCamera = handle.current!.camera();
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1280);
    rerender(<AtlasCanvas {...base} {...make(1280)} ref={handle}/>); flush();
    expect(handle.current!.camera()).toEqual(ownCamera);
  });
});
describe('legibilidad y alcance de las obras', () => {
  function drawItem(lens: Lens, k: number, point = { x: 0, y: 0 }, options: { targets?: Map<string, SceneTarget>; extras?: AtlasWork[] } = {}) {
    const noop = () => {};
    const roundRect = vi.fn(), arc = vi.fn();
    const fakeCtx = new Proxy({ roundRect, arc } as Record<string, unknown>, {
      get: (target, prop: string) => prop === 'measureText' ? () => ({ width: 1 })
        : prop === 'createRadialGradient' ? () => ({ addColorStop: noop }) : prop in target ? target[prop] : noop,
      set: (target, prop: string, value) => { target[prop] = value; return true; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    const created: { src: string }[] = [];
    vi.stubGlobal('Image', class { src = ''; onload = null; onerror = null; decoding = ''; constructor() { created.push(this); } });
    const item = { ...works[0], coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg' };
    const customScene = { ...scene, lens, targets: options.targets ?? new Map([[item.key, { ...point, key: item.key, alpha: 1, glow: false, diff: lens === 'opinion' ? 0 : null }]]), links: [] };
    const activate = vi.fn(), hover = vi.fn();
    const canvasProps = { label: 'Mapa', people, works: [item, ...options.extras ?? []], active: ['a', 'b'], scene: customScene,
      quien: layout, tiempo: tiempoLayout, islas: islasLayout, initialCamera: { x: 0, y: 0, k }, countLabel: String,
      onTogglePerson: () => {}, onHover: hover, onActivate: activate };
    const { container, rerender } = render(<AtlasCanvas {...canvasProps}/>);
    flush();
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
    return { created, roundRect, arc, canvas, activate, hover, canvasProps, rerender };
  }

  it.each(['opinion', 'tiempo'] as Lens[])('%s muestra y pide la portada a zoom 0.7 con un mínimo legible', lens => {
    const { created, roundRect } = drawItem(lens, 0.7);
    expect(created).toHaveLength(1);
    const cover = roundRect.mock.calls.find(([, , , , radius]) => Math.abs(radius - 1.28) < 0.00001)!;
    expect(cover[2]).toBeCloseTo(12);
    expect(cover[3] / cover[2]).toBeCloseTo(1.45, 2);
    expect(frames).toHaveLength(0);
  });
  it.each(['quien', 'islas'] as Lens[])('%s conserva los puntos a zoom 0.7 sin pedir portadas', lens => {
    expect(drawItem(lens, 0.7).created).toHaveLength(0);
  });
  it.each(['opinion', 'tiempo'] as Lens[])('%s conserva el modo punto hasta el umbral 0.6', lens => {
    expect(drawItem(lens, 0.6).created).toHaveLength(0);
  });
  it.each([
    { lens: 'tiempo', width: 23.52, height: 34.16 }, { lens: 'opinion', width: 28, height: 40.6 },
  ] as const)('$lens pinta la portada un 40 % mayor a igual zoom', ({ lens, width, height }) => {
    const { roundRect } = drawItem(lens, 2);
    const cover = roundRect.mock.calls.find(([, , , , radius]) => Math.abs(radius - 1.8) < 0.00001)!;
    expect(cover[2]).toBeCloseTo(width);
    expect(cover[3]).toBeCloseTo(height);
  });
  it('aumenta también el punto compartido un 40 % antes de mostrar portadas', () => {
    const { arc } = drawItem('tiempo', 0.5);
    const dot = arc.mock.calls.find(([x, y]) => x === 400 && y === 300)!;
    expect(dot[2]).toBeCloseTo(3.332);
  });
  it('una esquina visible de una portada ampliada sigue respondiendo a hover y toque', () => {
    const { canvas, activate, hover } = drawItem('tiempo', 16);
    const corner = { clientX: 490, clientY: 433, pointerType: 'mouse', pointerId: 1 };
    fireEvent.pointerMove(canvas, corner);
    expect(hover).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'book:1' }));
    fireEvent.pointerDown(canvas, corner); fireEvent.pointerUp(canvas, corner);
    expect(activate).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'book:1' }), 'mouse');
  });
  const target = (key: WorkKey, x: number, alpha = 1): SceneTarget => ({ key, x, y: 0, alpha, glow: false, diff: null });
  it('entre portadas superpuestas elige el centro más próximo y, en un empate, la aparición posterior', () => {
    const second: AtlasWork = { ...works[0], key: 'book:2' };
    const { canvas, hover } = drawItem('tiempo', 2, undefined, { extras: [second], targets: new Map([
      ['book:1', target('book:1', 0)], ['book:2', target('book:2', 4)],
    ]) });
    fireEvent.pointerMove(canvas, { clientX: 402, clientY: 300, pointerType: 'mouse' });
    expect(hover).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'book:1' }));
    fireEvent.pointerMove(canvas, { clientX: 404, clientY: 300, pointerType: 'mouse' });
    expect(hover).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'book:2' }));
  });
  it.each([{ alpha: 0.49, expected: 'book:1' }, { alpha: 0.5, expected: 'book:2' }])('el alcance respeta el mínimo de alfa: $alpha → $expected', ({ alpha, expected }) => {
    const second: AtlasWork = { ...works[0], key: 'book:2' };
    const { canvas, hover } = drawItem('tiempo', 2, undefined, { extras: [second], targets: new Map([
      ['book:1', target('book:1', 0)], ['book:2', target('book:2', 2, alpha)],
    ]) });
    fireEvent.pointerMove(canvas, { clientX: 404, clientY: 300, pointerType: 'mouse' });
    expect(hover).toHaveBeenLastCalledWith(expect.objectContaining({ key: expected }));
  });
  it('una aparición que está volviendo a casa deja de responder aunque siga visible', () => {
    const { canvas, hover, canvasProps, rerender } = drawItem('tiempo', 2, undefined, { targets: new Map([
      ['book:1', target('book:1', 0)], ['book:1@b', target('book:1', 40)],
    ]) });
    fireEvent.pointerMove(canvas, { clientX: 480, clientY: 300, pointerType: 'mouse' });
    expect(hover).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'book:1' }));
    rerender(<AtlasCanvas {...canvasProps} scene={{ ...canvasProps.scene, targets: new Map([['book:1', target('book:1', 0)]]) }}/>);
    // Before the next frame, the extra is still at its old place and fully visible, but marked as dying.
    fireEvent.pointerMove(canvas, { clientX: 480, clientY: 300, pointerType: 'mouse' });
    expect(hover).toHaveBeenLastCalledWith(null);
  });
  it.each([{ x: -475 / 16, y: 0 }, { x: 0, y: -400 / 16 }])('pinta y pide la portada que asoma aunque su centro esté fuera del margen antiguo: %j', point => {
    const { created, roundRect } = drawItem('tiempo', 16, point);
    expect(created).toHaveLength(1);
    expect(roundRect.mock.calls.some(([, , width]) => Math.abs(width - 188.16) < 0.00001)).toBe(true);
  });
});
const pick = ({ x, y, k }: { x: number; y: number; k: number }) => ({ x, y, k });
