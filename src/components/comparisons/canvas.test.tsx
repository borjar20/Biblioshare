// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/es.json';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { View } from './state';
const load = vi.hoisted(() => vi.fn());
vi.mock('@/lib/comparisons/actions', () => ({ loadComparisonWork: load }));
import { ComparisonCanvas } from './canvas';
const snapshot: Snapshot = { group: { id: 'g', name: 'Grupo', revision: 1, members: ['Ana', 'Bea', 'Carlos'].map((name, i) => ({ slotId: `${i}`, userId: `${i}`, name, avatarUrl: null, available: true })) }, format: 'all', catalog: Array.from({ length: 83 }, (_, i) => ({ key: `book:${i}` as WorkKey, title: `Libro ${String(i).padStart(2, '0')}`, coverUrl: '/cover.jpg', genres: [], creators: [] })), works: Array.from({ length: 83 }, (_, i) => ['0', '1'].map(userId => ({ key: `book:${i}` as WorkKey, userId, rating: null, orderUnknown: false, progress: null }))).flat(), excludedSeriesWithoutEpisodes: 0 };
function Harness({ initial = { level: 'venn', people: ['0', '1', '2'] }, data = snapshot }: { initial?: View; data?: Snapshot }) {
  const [view, setView] = useState<View>(initial);
  return <NextIntlClientProvider locale="es" messages={messages}><ComparisonCanvas snapshot={data} view={view} onView={setView}/></NextIntlClientProvider>;
}
beforeEach(() => { load.mockReset(); load.mockImplementation(async (_group, key, people) => ({ ok: true, data: { work: snapshot.catalog.find(work => work.key === key), people: snapshot.works.filter(work => work.key === key && people.includes(work.userId)), commonEpisodes: [] } })); });
afterEach(cleanup);
describe('comparison canvas', () => {
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
