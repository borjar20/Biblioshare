// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/es.json';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { TasteControls, View } from './state';
import { Tastes } from './tastes';
vi.mock('@/lib/comparisons/actions', () => ({ loadComparisonWork: vi.fn(async () => ({ ok: false, code: 'load-failed' })) }));
export const data: Snapshot = {
  group: { id: 'g', name: 'Amigos', revision: 1, members: ['Ana', 'Bea'].map((name, i) => ({ slotId: name, userId: `${i}`, name, avatarUrl: null, available: true })) },
  format: 'all', excludedSeriesWithoutEpisodes: 2,
  catalog: Array.from({ length: 6 }, (_, i) => ({ key: `book:${i}` as WorkKey, title: `Libro ${i}`, coverUrl: '/cover.jpg', genres: ['Drama', 'Misterio'], creators: [{ id: 'author', name: 'Autora', role: 'author' as const }] })),
  works: [8, 9, 10, 7, 9, null].map((rating, i) => ({ key: `book:${i}` as WorkKey, userId: i < 3 ? '0' : '1', rating, orderUnknown: false, progress: null })),
};
function Harness({ snapshot = data, people = ['0', '1'] }: { snapshot?: Snapshot; people?: string[] }) {
  const [view, onView] = useState<View>({ level: 'group' });
  const [controls, onControlsChange] = useState<TasteControls>({ facetKind: 'genre', signal: 'consumed' });
  return <NextIntlClientProvider locale="es" messages={messages}><Tastes snapshot={snapshot} people={people} view={view} onView={onView} controls={controls} onControlsChange={onControlsChange} onOpenWork={(key, origin) => onView({ level: 'work', people, key, origin })}/></NextIntlClientProvider>;
}
beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })); vi.stubGlobal('scrollTo', vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('tastes evidence', () => {
  it('shows consumption and ratings together on their own scales without inventing affinity', () => {
    render(<Harness/>);
    const consumed = screen.getByRole('region', { name: 'Lo que consumimos' });
    const rated = screen.getByRole('region', { name: 'Lo que nos gusta' });
    expect(within(consumed).getByRole('button', { name: 'Explorar Drama' })).toBeTruthy();
    expect(within(rated).getByText('Media sobre 10')).toBeTruthy();
    expect(within(rated).getByLabelText('3 obras valoradas').textContent).toBe('9.0');
    expect(within(rated).getByLabelText('2 obras valoradas').textContent).toBe('8.0');
    expect(within(rated).getByText(/No es un porcentaje de afinidad/)).toBeTruthy();
    expect(screen.getByText('Ana: metadatos en 3 de 3 obras elegibles')).toBeTruthy();
  });
  it('restores the exact category after Canvas unmounts and falls back when it disappears', () => {
    const { rerender } = render(<Harness/>);
    fireEvent.click(screen.getByRole('button', { name: 'Explorar Misterio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver al grupo' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Explorar Misterio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Explorar Misterio' }));
    rerender(<Harness snapshot={{ ...data, catalog: data.catalog.map(work => ({ ...work, genres: ['Drama'] })) }}/>);
    expect(document.activeElement).toBe(screen.getByLabelText('Agrupar por'));
  });
  it('makes consumption bubble area proportional to unique quantity including an empty category', () => {
    const snapshot = { ...data, works: data.works.filter((row, i) => row.userId === '0' || i === 3) };
    const { container, rerender } = render(<Harness snapshot={snapshot}/>);
    const bubbles = Array.from(container.querySelectorAll<HTMLElement>('[data-consumption-count]')).slice(0, 2);
    expect(bubbles).toHaveLength(2);
    expect(parseFloat(bubbles[0].style.width) ** 2 / (parseFloat(bubbles[1].style.width) ** 2)).toBeCloseTo(3);
    rerender(<Harness snapshot={{ ...snapshot, works: snapshot.works.filter(row => row.userId === '0') }}/>);
    expect(container.querySelector<HTMLElement>('[data-consumption-count="0"]')?.style.width).toBe('0px');
  });
  it('sizes category bubbles by distinct works rather than summing people or repeated records', () => {
    const snapshot: Snapshot = { ...data,
      catalog: data.catalog.slice(0, 4).map((work, i) => ({ ...work, genres: i === 0 ? ['Drama', 'Misterio'] : ['Drama'] })),
      works: [...data.works.slice(0, 3), { ...data.works[0], userId: '1' }, { ...data.works[3] }, data.works[0]],
    };
    render(<Harness snapshot={snapshot}/>);
    const consumed = screen.getByRole('region', { name: 'Lo que consumimos' });
    const drama = within(consumed).getByRole('button', { name: 'Explorar Drama' });
    const mystery = within(consumed).getByRole('button', { name: 'Explorar Misterio' });
    expect(drama.textContent).toContain('4 obras distintas');
    expect(mystery.textContent).toContain('1 obra distinta');
    expect(Number(drama.style.getPropertyValue('--bubble-ratio')) ** 2 / Number(mystery.style.getPropertyValue('--bubble-ratio')) ** 2).toBe(4);
  });
  it('shows individual means and samples at three/two without a joint trend', () => {
    render(<Harness/>); fireEvent.click(screen.getByRole('button', { name: 'Lo que valoráis' }));
    const category = screen.getByRole('region', { name: 'Drama' });
    expect(within(category).getByText(/Muestra insuficiente/).textContent).toContain('Bea');
    expect(within(category).getByLabelText('3 obras valoradas').textContent).toBe('9.0');
    expect(within(category).getByLabelText('2 obras valoradas').textContent).toBe('8.0');
    expect(within(category).queryByText('Muestra suficiente para una tendencia conjunta')).toBeNull();
  });
  it('gates at three unique rated works and shows equal high means with different ranges without work-level labels', () => {
    render(<Harness snapshot={{ ...data, works: data.works.map((row, i) => ({ ...row, rating: i < 3 ? [8, 9, 10][i] : [7, 10, 10][i - 3] })) }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Lo que valoráis' }));
    const category = screen.getByRole('region', { name: 'Drama' });
    expect(within(category).getByText('Muestra suficiente para una tendencia conjunta')).toBeTruthy();
    expect(within(category).getByText('Rango 8–10')).toBeTruthy(); expect(within(category).getByText('Rango 7–10')).toBeTruthy();
    expect(within(category).getAllByLabelText('3 obras valoradas').map(node => node.textContent)).toEqual(['9.0', '9.0']);
    expect(screen.queryByText('Os encantó')).toBeNull(); expect(screen.queryByText('Diferencia de opinión')).toBeNull();
  });
  it('shows zero-note samples and incomplete creator coverage including missing catalogue works', () => {
    const snapshot: Snapshot = { ...data, catalog: data.catalog.map((row, i) => i === 5 ? { ...row, title: '', metadataMissing: true, creators: [], genres: [] } : row), works: data.works.map(row => ({ ...row, rating: null })) };
    render(<Harness snapshot={snapshot}/>); fireEvent.change(screen.getByLabelText('Agrupar por'), { target: { value: 'author' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lo que valoráis' }));
    const category = screen.getByRole('region', { name: 'Autora' });
    expect(within(category).getAllByLabelText('0 obras valoradas').map(node => node.textContent)).toEqual(['Sin valorar', 'Sin valorar']);
    expect(screen.getByText('Bea: metadatos en 2 de 3 obras elegibles')).toBeTruthy();
  });
  it('opens different titles by the same author without inventing a Venn and returns to the same signal', async () => {
    const { container } = render(<Harness/>); fireEvent.change(screen.getByLabelText('Agrupar por'), { target: { value: 'author' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lo que valoráis' })); fireEvent.click(screen.getByRole('button', { name: 'Explorar Autora' }));
    expect(screen.getByText('Libro 0: 8')).toBeTruthy(); expect(screen.getByText('Libro 3: 7')).toBeTruthy();
    const cover = screen.getByRole('button', { name: 'Abrir obra: Libro 3' }); const originalPosition = cover.style.cssText; vi.stubGlobal('scrollY', 900); fireEvent.click(cover);
    await screen.findByRole('alert'); expect(container.querySelectorAll('circle')).toHaveLength(0);
    expect(container.querySelectorAll('[data-region-mask]')).toHaveLength(0);
    expect(container.querySelector('[data-work-key="book:3"]')).toBe(cover);
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la categoría' }));
    expect((screen.getByLabelText('Agrupar por') as HTMLSelectElement).value).toBe('author');
    expect(screen.getByRole('button', { name: 'Lo que valoráis' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(cover); expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'instant' });
    expect(cover.style.cssText).toBe(originalPosition);
    expect(screen.getByText('Ana, Bea')).toBeTruthy();
  });
  it.each([0, 1, 2, 3])('requires three unique rated works, at B sample %i, without counting duplicate rows', count => {
    const works = data.works.map((row, i) => ({ ...row, rating: i < 3 ? 9 : i - 3 < count ? 8 : null }));
    render(<Harness snapshot={{ ...data, works: [...works, works[3]] }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Lo que valoráis' })); const category = screen.getByRole('region', { name: 'Drama' });
    expect(within(category).getAllByLabelText(`${count} obras valoradas`).some(node => node.textContent === (count ? '8.0' : 'Sin valorar'))).toBe(true);
    expect(!!within(category).queryByText('Muestra suficiente para una tendencia conjunta')).toBe(count === 3);
  });
  it('counts a zero note as rated instead of treating it as absent', () => {
    render(<Harness snapshot={{ ...data, works: data.works.map(row => ({ ...row, rating: 0 })) }}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Lo que valoráis' }));
    expect(within(screen.getByRole('region', { name: 'Drama' })).getAllByLabelText('3 obras valoradas').map(node => node.textContent)).toEqual(['0.0', '0.0']);
  });
  it('uses a director facet scene for ten people with no Venn or fabricated consumption regions', async () => {
    const people = Array.from({ length: 10 }, (_, i) => `${i}`);
    const snapshot: Snapshot = { ...data, group: { ...data.group, members: people.map(userId => ({ slotId: userId, userId, name: `Persona ${userId}`, avatarUrl: null, available: true })) }, catalog: [{ ...data.catalog[0], key: 'movie:director', title: 'Película', creators: [{ id: 'd', name: 'Directora', role: 'director' }] }], works: people.map(userId => ({ ...data.works[0], key: 'movie:director', userId })) };
    const { container } = render(<Harness snapshot={snapshot} people={people}/>);
    fireEvent.change(screen.getByLabelText('Agrupar por'), { target: { value: 'director' } }); fireEvent.click(screen.getByRole('button', { name: 'Explorar Directora' }));
    expect(container.querySelectorAll('circle, [data-region-mask]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir obra: Película' })); await screen.findByRole('alert');
    expect(container.querySelectorAll('circle, [data-region-mask]')).toHaveLength(0);
  });
});
