// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/es.json';
import type { Snapshot, WorkDetail as Detail } from '@/lib/comparisons/types';
const load = vi.hoisted(() => vi.fn());
vi.mock('@/lib/comparisons/actions', () => ({ loadComparisonWork: load }));
import { WorkDetail } from './work-detail';
const snapshot: Snapshot = { group: { id: 'g', revision: 1, name: 'Amigos', members: ['Ana', 'Bea'].map((name, i) => ({ slotId: name, userId: `${i}`, name, avatarUrl: null, available: true })) }, format: 'series', catalog: [{ key: 'series:x', title: 'Serie', coverUrl: null, genres: [], creators: [] }], works: [], excludedSeriesWithoutEpisodes: 2 };
function ui(detail: Detail) { load.mockResolvedValue({ ok: true, data: detail }); return <NextIntlClientProvider locale="es" messages={messages}><WorkDetail snapshot={snapshot} work={snapshot.catalog[0]} view={{ level: 'work', people: ['0', '1'], key: 'series:x', origin: { kind: 'facet', facetKind: 'genre', facetId: 'Drama' } }}/></NextIntlClientProvider>; }
const detail: Detail = { work: snapshot.catalog[0], people: [{ userId: '0', key: 'series:x', rating: 9, orderUnknown: false, progress: { seenEver: 1, current: 1, aired: null, status: 'dropped' } }, { userId: '1', key: 'series:x', rating: null, orderUnknown: false, progress: null }], commonEpisodes: [{ season: 1, episode: 1, notes: [{ userId: '0', rating: 3 }, { userId: '1', rating: 8 }] }] };
afterEach(cleanup);
describe('series detail evidence', () => {
  it.each([0, 1, 40])('reports the all-person episode sample %i independently of series ratings', async count => {
    const episodes = Array.from({ length: count }, (_, index) => ({ season: 1, episode: index + 1, notes: [{ userId: '0', rating: 3 }, { userId: '1', rating: 8 }] }));
    render(ui({ ...detail, commonEpisodes: episodes }));
    expect(await screen.findByText(`${count} episodios comunes valorados por todas las personas indicadas.`)).toBeTruthy();
    if (!count) expect(screen.getByText('No hay episodios comunes valorados por todas las personas indicadas.')).toBeTruthy();
  });
  it('does not imply joint comparison for an exclusive single-person series', async () => {
    load.mockResolvedValue({ ok: true, data: detail });
    render(<NextIntlClientProvider locale="es" messages={messages}><WorkDetail snapshot={snapshot} work={snapshot.catalog[0]} view={{ level: 'work', people: ['0', '1'], key: 'series:x', origin: { kind: 'region', mask: 1 } }}/></NextIntlClientProvider>);
    expect(await screen.findByText('Esta región corresponde a una sola persona; no hay comparación conjunta de episodios.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Episodios comunes' })).toBeNull();
  });
  it.each([
    { status: 'completed', label: 'Terminada' },
    { status: 'dropped', label: 'Abandonada' },
    { status: 'in_progress', label: 'En curso' },
  ])('labels canonical $status without changing its current-pass progress', async ({ status, label }) => {
    render(ui({ ...detail, people: [{ ...detail.people[0], progress: {
      seenEver: 4, current: 2, aired: 10, status,
    } }] }));
    expect(await screen.findByText(label)).toBeTruthy();
    expect(screen.getByText('Pase actual: 2 de 10 episodios emitidos')).toBeTruthy();
    if (status !== 'in_progress') expect(screen.queryByText('En curso')).toBeNull();
  });
  it('separates general notes and unavailable progress from an episode rated by all people', async () => {
    render(ui(detail)); await screen.findByRole('heading', { name: 'Episodios comunes' });
    expect(screen.getByRole('heading', { name: 'Valoración general y progreso' })).toBeTruthy();
    expect(screen.getByText('Progreso no disponible')).toBeTruthy(); expect(screen.getByText('Abandonada')).toBeTruthy();
    const episodes = screen.getByRole('region', { name: 'Episodios comunes' });
    expect(within(episodes).getByText('Temporada 1 · episodio 1')).toBeTruthy();
    expect(within(episodes).getByText('Ana: 3')).toBeTruthy(); expect(within(episodes).getByText('Bea: 8')).toBeTruthy();
    expect(screen.queryByText(/historiales de persona y serie/)).toBeNull();
  });
  it('explains no episodes with notes shared by every named participant', async () => {
    render(ui({ ...detail, commonEpisodes: [] })); expect(await screen.findByText('No hay episodios comunes valorados por todas las personas indicadas.')).toBeTruthy();
  });
  it('reports growing evidence height so episode notes can use page scroll', async () => {
    const onEvidenceHeight = vi.fn();
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
    load.mockResolvedValue({ ok: true, data: detail });
    render(<NextIntlClientProvider locale="es" messages={messages}><WorkDetail snapshot={snapshot} work={snapshot.catalog[0]} view={{ level: 'work', people: ['0', '1'], key: 'series:x', origin: { kind: 'facet', facetKind: 'genre', facetId: 'Drama' } }} onEvidenceHeight={onEvidenceHeight}/></NextIntlClientProvider>);
    await screen.findByRole('heading', { name: 'Episodios comunes' }); expect(onEvidenceHeight).toHaveBeenCalledWith(1340);
    height.mockRestore();
  });
});
