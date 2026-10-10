// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/es.json';
import type { Snapshot, WorkDetail, WorkKey } from '@/lib/comparisons/types';
import type { View } from './state';
const load = vi.hoisted(() => vi.fn());
vi.mock('@/lib/comparisons/actions', () => ({ loadComparisonWork: load }));
import { ComparisonCanvas } from './canvas';
import { layoutScene } from './geometry';
const snapshot: Snapshot = { group: { id: 'g', name: 'Grupo', revision: 1, members: ['Ana', 'Bea', 'Carlos'].map((name, i) => ({ slotId: `${i}`, userId: `${i}`, name, avatarUrl: null, available: true })) }, format: 'all', catalog: Array.from({ length: 83 }, (_, i) => ({ key: `book:${i}` as WorkKey, title: `Libro ${String(i).padStart(2, '0')}`, coverUrl: '/cover.jpg', genres: [], creators: [] })), works: Array.from({ length: 83 }, (_, i) => ['0', '1'].map(userId => ({ key: `book:${i}` as WorkKey, userId, rating: null, orderUnknown: false, progress: null }))).flat(), excludedSeriesWithoutEpisodes: 0 };
function Harness({ initial = { level: 'venn', people: ['0', '1', '2'] }, data = snapshot, selection = false }: { initial?: View; data?: Snapshot; selection?: boolean }) {
  const [view, setView] = useState<View>(initial);
  const [selected, setSelected] = useState<string[]>([]);
  return <NextIntlClientProvider locale="es" messages={messages}><ComparisonCanvas snapshot={data} view={view} onView={setView} selectedPeople={selection ? selected : undefined} onTogglePerson={selection ? id => setSelected(current => current.includes(id) ? current.filter(person => person !== id) : [...current, id]) : undefined} facetKeys={initial.level === 'facet' ? data.catalog.map(work => work.key) : undefined} onOpenFacetWork={key => { if (view.level === 'facet') setView({ level: 'work', people: view.people, key, origin: { kind: 'facet', facetKind: view.facetKind, facetId: view.facetId } }); }}/></NextIntlClientProvider>;
}
beforeEach(() => {
  // These scaffold assertions inspect final geometry; motion has dedicated
  // frame/cleanup tests and real-browser bounding-box coverage.
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('scrollTo', vi.fn());
  load.mockReset(); load.mockImplementation(async (_group, key, people) => ({ ok: true, data: { work: snapshot.catalog.find(work => work.key === key), people: snapshot.works.filter(work => work.key === key && people.includes(work.userId)), commonEpisodes: [] } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('comparison canvas', () => {
  it.each([2, 3])('returns focus to Compare selection after opening a %i-person Venn', count => {
    const data = { ...snapshot, group: { ...snapshot.group, members: Array.from({ length: 10 }, (_, i) => ({ slotId: String(i), userId: String(i), name: `Persona ${i}`, avatarUrl: null, available: true })) } };
    const { container } = render(<Harness initial={{ level: 'group' }} data={data} selection/>);
    const disclosure = container.querySelector('details')!;
    act(() => { disclosure.open = true; fireEvent(disclosure, new Event('toggle')); });
    for (let index = 0; index < count; index++) fireEvent.click(screen.getByRole('checkbox', { name: `Persona ${index}` }));
    fireEvent.click(screen.getByRole('button', { name: messages.comparisons.compareSelection }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver al grupo' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: messages.comparisons.compareSelection }));
    expect(container.querySelector('details')!.open).toBe(true);
  });
  it('recenters the real group fan after returning from a restored Venn with 83 stories', () => {
    const data: Snapshot = { ...snapshot, group: { ...snapshot.group, members: Array.from({ length: 10 }, (_, i) => ({ slotId: String(i), userId: String(i), name: `Persona ${i}`, avatarUrl: null, available: true })) }, works: [
      ...snapshot.works,
      ...snapshot.catalog.slice(50).flatMap(work => ['8', '9'].map(userId => ({ key: work.key, userId, rating: null, orderUnknown: false, progress: null }))),
    ] };
    const { container } = render(<Harness initial={{ level: 'venn', people: ['8', '9'] }} data={data}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al grupo' }));
    const first = container.querySelector<HTMLElement>('[data-work-key="book:0"]')!;
    const expected = layoutScene(data, { level: 'group' }, { width: 640, height: 500 }, ['book:0', 'book:1', 'book:2']);
    expect(first.style.left).toBe(`${expected.poses['book:0'].x}px`);
    expect(first.style.top).toBe(`${expected.poses['book:0'].y}px`);
  });
  it('counts the union of shared stories separately from works shared by everyone', () => {
    const data: Snapshot = { ...snapshot, catalog: snapshot.catalog.slice(0, 3), works: [
      ...['0', '1'].map(userId => ({ ...snapshot.works[0], userId, key: 'book:0' as WorkKey })),
      ...['0', '2'].map(userId => ({ ...snapshot.works[0], userId, key: 'book:1' as WorkKey })),
      ...['0', '1', '2'].map(userId => ({ ...snapshot.works[0], userId, key: 'book:2' as WorkKey })),
    ] };
    render(<Harness initial={{ level: 'group' }} data={data}/>);
    const center = screen.getByText('historias os conectan').parentElement!;
    expect(center.querySelector('strong')!.textContent).toBe('3');
    const shelf = screen.getByRole('heading', { name: messages.comparisons.sharedShelf }).closest('section')!;
    expect(shelf.querySelector('ul')!.children).toHaveLength(1);
    expect(shelf.querySelector('header p')!.textContent).toMatch(/^1\s/);
  });
  it('selects native avatar checkboxes and opens the matching pair from the map', () => {
    render(<Harness initial={{ level: 'group' }} selection/>);
    const compare = screen.getByRole('button', { name: messages.comparisons.compareSelection });
    expect((compare as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana' }));
    expect((compare as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bea' }));
    expect((compare as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(compare);
    expect(screen.getAllByRole('button', { name: /Abrir región:/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Abrir región: Ana, Bea; 83 obras' })).toBeTruthy();
  });
  it('folds a ten-person map and restores the expanded origin pair on return', () => {
    const data = { ...snapshot, group: { ...snapshot.group, members: Array.from({ length: 10 }, (_, i) => ({ slotId: String(i), userId: String(i), name: `Persona ${i}`, avatarUrl: null, available: true })) } };
    const { container } = render(<Harness initial={{ level: 'group' }} data={data}/>);
    const disclosure = container.querySelector('details')!;
    expect(disclosure.open).toBe(false);
    expect(container.querySelectorAll('[data-map-pair]')).toHaveLength(45);
    act(() => { disclosure.open = true; fireEvent(disclosure, new Event('toggle')); });
    const pair = screen.getByRole('button', { name: 'Persona 8, Persona 9 0 obras comunes' });
    fireEvent.click(pair);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al grupo' }));
    expect(container.querySelector('details')!.open).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Persona 8, Persona 9 0 obras comunes' }));
  });
  it('falls back to a surviving map control when refresh removes the origin pair', () => {
    const { rerender } = render(<Harness initial={{ level: 'group' }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Bea, Carlos 0 obras comunes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver al grupo' }));
    const data = { ...snapshot, group: { ...snapshot.group, revision: 2, members: snapshot.group.members.slice(0, 2) } };
    rerender(<Harness initial={{ level: 'group' }} data={data}/>);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ana, Bea 83 obras comunes' }));
  });
  it('returns to the originating non-first pair and exact region', () => {
    render(<Harness initial={{ level: 'group' }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Bea, Carlos 0 obras comunes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir región: Carlos; 0 obras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver al Venn' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir región: Carlos; 0 obras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver al grupo' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bea, Carlos 0 obras comunes' }));
  });
  it('returns focus to the populated intersection control instead of its first work cover', () => {
    render(<Harness/>);
    const region = screen.getByRole('button', { name: 'Abrir región: Ana, Bea; 83 obras' });
    region.focus();
    fireEvent.click(region);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al Venn' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir región: Ana, Bea; 83 obras' }));
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Explorar el cruce de Libro 00' }));
  });
  it.each<View>([{ level: 'region', people: ['0', '1'], mask: 3 }, { level: 'facet', people: ['0', '1'], facetKind: 'genre', facetId: 'Drama' }])('keeps the 720ms clock and focus/scroll return when delayed detail and later resizing grow evidence: %j', async initial => {
    let now = 0; let frameId = 0; let evidenceSize = 0;
    const frames = new Map<number, FrameRequestCallback>(); const observers = new Set<() => void>();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => evidenceSize);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('ResizeObserver', class { constructor(private callback: () => void) { observers.add(callback); } observe() {} disconnect() { observers.delete(this.callback); } });
    const tick = (time: number) => { now = time; const callbacks = [...frames.values()]; frames.clear(); act(() => callbacks.forEach(callback => callback(now))); };
    const data: Snapshot = { ...snapshot, catalog: [{ key: 'series:x', title: 'Serie', coverUrl: '/cover.jpg', genres: ['Drama'], creators: [] }], works: ['0', '1'].map(userId => ({ userId, key: 'series:x', rating: null, orderUnknown: false, progress: null })) };
    let finish!: (result: { ok: true; data: WorkDetail }) => void; load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { container } = render(<Harness initial={initial} data={data}/>);
    const host = container.querySelector('[data-camera-moving]')!; const stage = container.querySelector('[data-comparison-stage]')!;
    const cover = screen.getByRole('button', { name: 'Abrir obra: Serie' }); const originStyle = cover.style.cssText;
    vi.stubGlobal('scrollY', 1600); fireEvent.click(cover); const world = container.querySelector('[data-comparison-world]')!;
    tick(300); expect(host.getAttribute('data-camera-moving')).toBe('true');
    evidenceSize = 900; await act(async () => finish({ ok: true, data: { work: data.catalog[0], people: data.works, commonEpisodes: [{ season: 1, episode: 1, notes: [{ userId: '0', rating: 9 }] }] } }));
    tick(720); expect(host.getAttribute('data-camera-moving')).toBe('false'); expect(frames.size).toBe(0);
    expect(Number(stage.getAttribute('data-scene-height'))).toBeGreaterThanOrEqual(1340);
    const back = screen.getByRole('button', { name: initial.level === 'facet' ? 'Volver a la categoría' : 'Volver al cruce' }); expect(document.activeElement).toBe(back);
    const completedTransform = world.getAttribute('style'); evidenceSize = 1200; now = 810; act(() => observers.forEach(callback => callback()));
    expect(Number(stage.getAttribute('data-scene-height'))).toBeGreaterThanOrEqual(1640); expect(world.getAttribute('style')).toBe(completedTransform); expect(frames.size).toBe(0);
    fireEvent.click(back); tick(1530); expect(host.getAttribute('data-camera-moving')).toBe('false');
    expect(container.querySelector('[data-work-key="series:x"]')).toBe(cover); expect(cover.style.cssText).toBe(originStyle); expect(document.activeElement).toBe(cover);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 1600, behavior: 'instant' });
  });
  it('keeps the original region scroll when the already selected work cover is clicked again', async () => {
    render(<Harness initial={{ level: 'region', people: ['0', '1'], mask: 3 }}/>);
    vi.stubGlobal('scrollY', 1600);
    const cover = screen.getByRole('button', { name: 'Abrir obra: Libro 00' });
    fireEvent.click(cover); await screen.findByRole('link', { name: 'Ver ficha' });
    vi.stubGlobal('scrollY', 100);
    fireEvent.click(cover);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al cruce' }));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 1600, behavior: 'instant' });
  });
  it('keeps all seven exact regions including zero, with an explicit empty state', () => {
    render(<Harness/>);
    expect(screen.getAllByRole('button', { name: /Abrir región:/ })).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir región: Carlos; 0 obras' }));
    expect(screen.getByText('No hay registros elegibles visibles en esta región.')).toBeTruthy();
  });
  it('filters the complete set while keeping base counts and explaining no qualifying notes', () => {
    render(<Harness initial={{ level: 'region', people: ['0', '1', '2'], mask: 3 }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Os encantó' }));
    expect(screen.getByText('83 obras en esta región')).toBeTruthy();
    expect(screen.getByText('0 de 0 obras')).toBeTruthy();
    expect(screen.getByText(/No hay obras con las valoraciones necesarias/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Todas las obras' }));
    expect(screen.getByText('24 de 83 obras')).toBeTruthy();
  });
  it('finds qualifying work beyond the first loaded batch', () => {
    const data = { ...snapshot, works: snapshot.works.map(work => ({ ...work, rating: work.key === 'book:82' ? 9 : null })) };
    render(<Harness data={data} initial={{ level: 'region', people: ['0', '1'], mask: 3 }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Os encantó' }));
    expect(screen.getByText('83 obras en esta región')).toBeTruthy();
    expect(screen.getByText('1 de 1 obras')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir obra: Libro 82' })).toBeTruthy();
  });
  it('restores a saved late work with its real row and retains that batch on return', async () => {
    render(<Harness initial={{ level: 'work', people: ['0', '1'], origin: { kind: 'region', mask: 3 }, key: 'book:40' }}/>);
    await screen.findByRole('link', { name: 'Ver ficha' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver al cruce' }));
    expect(screen.getByText('48 de 83 obras')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir obra: Libro 40' })).toBeTruthy();
  });
  it('requests only the single owner of an exclusive region', async () => {
    const data = { ...snapshot, works: snapshot.works.filter(work => work.userId === '0') };
    render(<Harness data={data} initial={{ level: 'region', people: ['0', '1', '2'], mask: 1 }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir obra: Libro 00' }));
    await screen.findByText('Sin valorar');
    expect(load).toHaveBeenCalledWith('g', 'book:0', ['0']);
    expect(screen.getAllByText('Sin valorar')).toHaveLength(1);
  });
  it('keeps one real cover node through map, Venn, region and loaded detail', async () => {
    const { container } = render(<Harness initial={{ level: 'group' }}/>);
    const cover = container.querySelector('[data-work-key="book:0"]');
    fireEvent.click(screen.getByRole('button', { name: /Ana, Bea 83 obras comunes/ }));
    expect(container.querySelector('[data-work-key="book:0"]')).toBe(cover);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir región: Ana, Bea; 83 obras' }));
    expect(container.querySelector('[data-work-key="book:0"]')).toBe(cover);
    const position = (cover as HTMLElement).style.cssText;
    fireEvent.click(screen.getByRole('button', { name: 'Abrir obra: Libro 00' }));
    const transform = container.querySelector('[data-comparison-world]')!.getAttribute('style');
    await screen.findByRole('link', { name: 'Ver ficha' });
    expect((cover as HTMLElement).style.cssText).toBe(position);
    expect(container.querySelector('[data-comparison-world]')!.getAttribute('style')).toBe(transform);
    expect(container.querySelectorAll('[data-work-key="book:0"]')).toHaveLength(1);
  });
  it('reaches all 83 works in stable batches, retains destination DOM and page on return, requests exact people', async () => {
    const { container } = render(<Harness initial={{ level: 'region', people: ['0', '1', '2'], mask: 3 }}/>);
    expect(screen.getByText('24 de 83 obras')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    const destination = screen.getByRole('button', { name: 'Abrir obra: Libro 40' });
    fireEvent.click(destination);
    await waitFor(() => expect(screen.getAllByText('Sin valorar')).toHaveLength(2));
    expect(load).toHaveBeenCalledWith('g', 'book:40', ['0', '1']);
    expect(container.querySelector('[data-work-key="book:40"]')).toBe(destination);
    expect(container.querySelectorAll('[data-work-key]')).toHaveLength(48);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al cruce' }));
    expect(screen.getByText('48 de 83 obras')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(screen.getByText('83 de 83 obras')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir obra: Libro 82' })).toBeTruthy();
  });
  it('reserves failed cover space and renders translated missing metadata', () => {
    const { container } = render(<Harness initial={{ level: 'region', people: ['0', '1'], mask: 3 }}/>);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy'); expect(img.getAttribute('width')).toBeTruthy();
    fireEvent.error(img); expect(screen.getByText('Sin portada')).toBeTruthy();
    cleanup();
    render(<Harness data={{ ...snapshot, catalog: snapshot.catalog.map((work, i) => i ? work : { ...work, title: '', metadataMissing: true }) }} initial={{ level: 'region', people: ['0', '1'], mask: 3 }}/>);
    expect(screen.getByRole('button', { name: 'Abrir obra: Obra sin información de catálogo' })).toBeTruthy();
  });
  it('retries detail errors and ignores a response after leaving the work', async () => {
    let resolve!: (value: unknown) => void;
    load.mockResolvedValueOnce({ ok: false, code: 'load-failed' }).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<Harness initial={{ level: 'region', people: ['0', '1'], mask: 3 }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir obra: Libro 00' }));
    await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Volver al cruce' }));
    await act(async () => resolve({ ok: false, code: 'unavailable' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('24 de 83 obras')).toBeTruthy();
  });
});
