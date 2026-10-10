// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../messages/es.json';
import type { Group, Result, Snapshot } from '@/lib/comparisons/types';
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn(), replace: vi.fn(), refresh: vi.fn(), unsubscribe: vi.fn(), getUser: vi.fn(), auth: null as ((event: string, session: { user: { id: string } } | null) => void) | null, query: '' }));
const mockRouter = { replace: mocks.replace, refresh: mocks.refresh };
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: mocks.getUser, onAuthStateChange: (callback: typeof mocks.auth) => { mocks.auth = callback; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }; } } }) }));
vi.mock('@/lib/comparisons/actions', () => ({ loadComparison: mocks.load, saveGroup: mocks.save, deleteGroup: mocks.remove, loadComparisonWork: vi.fn(async () => ({ ok: false, code: 'load-failed' })) }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter, useSearchParams: () => new URLSearchParams(mocks.query) }));
import { Explorer, explorerReducer } from './explorer';
import { initialState } from './state';
import type { ExplorerState, View } from './state';
const group = (suffix: string, name: string): Group => ({ id: `${suffix.repeat(8)}-${suffix.repeat(4)}-${suffix.repeat(4)}-${suffix.repeat(4)}-${suffix.repeat(12)}`, name, revision: 1, members: [{ slotId: 'one', userId: 'a', name: 'Ana', avatarUrl: null, available: true }, { slotId: 'two', userId: null, name: null, avatarUrl: null, available: false }] });
const first = group('a', 'Lectores'); const second = group('b', 'Cine');
const snapshot = (g: Group): Snapshot => ({ group: g, format: 'all', catalog: [], works: [], excludedSeriesWithoutEpisodes: 0 });
function ui(groups = [first, second], viewerId = 'a') { return <NextIntlClientProvider locale="es" messages={messages}><Explorer initialGroups={groups} candidates={[{ userId: 'a', name: 'Ana', avatarUrl: null }, { userId: 'b', name: 'Bea', avatarUrl: null }]} viewerId={viewerId}/></NextIntlClientProvider>; }
beforeEach(() => { vi.clearAllMocks(); mocks.query = ''; mocks.load.mockResolvedValue({ ok: true, data: snapshot(first) }); mocks.getUser.mockResolvedValue({ data: { user: { id: 'a' } }, error: null }); });
afterEach(cleanup);
describe('independent format view retention', () => {
  it('retains controlled taste category and signal across sections and its own reload', () => {
    const controlled = explorerReducer(initialState('a'), { type: 'tasteControls', controls: { facetKind: 'director', signal: 'rated' } });
    const switched = explorerReducer(controlled, { type: 'section', section: 'tastes' });
    const loading = explorerReducer(switched, { type: 'loading', seq: 4 });
    const ready = explorerReducer(loading, { type: 'response', seq: 4, result: { ok: true, data: snapshot(first) } });
    expect(ready.tasteControls).toEqual({ facetKind: 'director', signal: 'rated' });
  });
  const availableGroup: Group = { ...first, members: [{ ...first.members[0] }, { slotId: 'two', userId: 'b', name: 'Bea', avatarUrl: null, available: true }] };
  const bookSnapshot: Snapshot = { ...snapshot(availableGroup), format: 'book', catalog: [{ key: 'book:x', title: 'Libro', coverUrl: null, genres: ['Ensayo'], creators: [] }], works: [{ key: 'book:x', userId: 'a', rating: null, orderUnknown: false, progress: null }] };
  const movieSnapshot: Snapshot = { ...snapshot(availableGroup), format: 'movie', catalog: [{ key: 'movie:y', title: 'Película', coverUrl: null, genres: ['Drama'], creators: [] }], works: [{ key: 'movie:y', userId: 'a', rating: null, orderUnknown: false, progress: null }] };
  const stateFor = (section: 'works' | 'tastes', views: ExplorerState['views']): ExplorerState => ({ ...initialState('a'), section, formats: { works: 'book', tastes: 'movie' }, views, selection: ['a', 'b'], snapshot: { seq: 2, value: null, status: 'loading' } });
  it.each<View>([
    { level: 'facet', people: ['a', 'b'], facetKind: 'genre', facetId: 'Drama' },
    { level: 'work', people: ['a', 'b'], origin: { kind: 'facet', facetKind: 'genre', facetId: 'Drama' }, key: 'movie:y' },
  ])('retains the inactive movie context %j through an active book load and restores it on its own load', tasteView => {
    const state = stateFor('works', { works: { level: 'group' }, tastes: tasteView });
    const books = explorerReducer(state, { type: 'response', seq: 2, result: { ok: true, data: bookSnapshot } });
    expect(books.views.tastes).toEqual(tasteView);
    const switched = explorerReducer(books, { type: 'section', section: 'tastes' });
    const loading = explorerReducer(switched, { type: 'loading', seq: 3 });
    expect(explorerReducer(loading, { type: 'response', seq: 3, result: { ok: true, data: movieSnapshot } }).views.tastes).toEqual(tasteView);
  });
  it('preserves an inactive book work/region origin while loading movies', () => {
    const bookView: View = { level: 'work', people: ['a', 'b'], origin: { kind: 'region', mask: 1 }, key: 'book:x' };
    const state = stateFor('tastes', { works: bookView, tastes: { level: 'group' } });
    expect(explorerReducer(state, { type: 'response', seq: 2, result: { ok: true, data: movieSnapshot } }).views.works).toEqual(bookView);
  });
  it('invalidates inactive contexts and selection when a participant loses access', () => {
    const tasteView: View = { level: 'work', people: ['a', 'b'], origin: { kind: 'facet', facetKind: 'genre', facetId: 'Drama' }, key: 'movie:y' };
    const state = stateFor('works', { works: { level: 'venn', people: ['a', 'b'] }, tastes: tasteView });
    const revoked: Snapshot = { ...bookSnapshot, group: { ...availableGroup, members: [availableGroup.members[0], { slotId: 'two', userId: null, name: null, avatarUrl: null, available: false }] } };
    const next = explorerReducer(state, { type: 'response', seq: 2, result: { ok: true, data: revoked } });
    expect(next.views).toEqual({ works: { level: 'group' }, tastes: { level: 'group' } }); expect(next.selection).toEqual(['a']);
  });
  it('validates the active facet against its own loaded format', () => {
    const state = stateFor('tastes', { works: { level: 'group' }, tastes: { level: 'facet', people: ['a', 'b'], facetKind: 'genre', facetId: 'Gone' } });
    expect(explorerReducer(state, { type: 'response', seq: 2, result: { ok: true, data: movieSnapshot } }).views.tastes).toEqual({ level: 'group' });
  });
  it('validates a retained destination view on switching sections when its format is already loaded', () => {
    const state: ExplorerState = { ...stateFor('works', { works: { level: 'group' }, tastes: { level: 'facet', people: ['a', 'b'], facetKind: 'genre', facetId: 'Gone' } }), formats: { works: 'book', tastes: 'book' }, snapshot: { seq: 2, value: bookSnapshot, status: 'ready' } };
    expect(explorerReducer(state, { type: 'section', section: 'tastes' }).views.tastes).toEqual({ level: 'group' });
  });
});
describe('Explorer request boundaries', () => {
  it('restores facet participants in the checkboxes after another section adds Carlos', async () => {
    const available: Group = { ...first, members: ['Ana', 'Bea', 'Carlos'].map((name, i) => ({ slotId: `${i}`, userId: ['a', 'b', 'c'][i], name, avatarUrl: null, available: true })) };
    const data: Snapshot = { ...snapshot(available), catalog: [{ key: 'book:x', title: 'Libro', coverUrl: null, genres: ['Drama'], creators: [] }], works: [{ userId: 'a', key: 'book:x', rating: 9, orderUnknown: false, progress: null }] };
    mocks.query = `group=${first.id}`; mocks.load.mockResolvedValue({ ok: true, data });
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(ui([available])); fireEvent.click(await screen.findByRole('checkbox', { name: 'Ana' })); fireEvent.click(screen.getByRole('checkbox', { name: 'Bea' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gustos' })); fireEvent.click(screen.getByRole('button', { name: 'Lo que valoráis' })); fireEvent.click(screen.getByRole('button', { name: 'Explorar Drama' }));
    fireEvent.click(screen.getByRole('button', { name: 'Obras' })); fireEvent.click(screen.getByRole('checkbox', { name: 'Carlos' }));
    expect((screen.getByRole('checkbox', { name: 'Carlos' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Gustos' }));
    expect(screen.getByText('Ana, Bea')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Lo que valoráis' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('checkbox', { name: 'Ana' }) as HTMLInputElement).checked).toBe(true); expect((screen.getByRole('checkbox', { name: 'Bea' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Carlos' }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Carlos' })); expect(screen.getByText('Ana, Bea, Carlos')).toBeTruthy();
    vi.unstubAllGlobals();
  });
  it('retains taste category, signal and participant context after section switches and its own format reload', async () => {
    const available: Group = { ...first, members: [{ ...first.members[0] }, { slotId: 'two', userId: 'b', name: 'Bea', avatarUrl: null, available: true }] };
    const data: Snapshot = { ...snapshot(available), catalog: [{ key: 'book:x', title: 'Libro', coverUrl: null, genres: ['Drama'], creators: [{ id: 'author', name: 'Autora', role: 'author' }] }], works: [{ userId: 'a', key: 'book:x', rating: 9, orderUnknown: false, progress: null }] };
    mocks.query = `group=${first.id}`; mocks.load.mockImplementation(async (_id, format) => ({ ok: true, data: { ...data, format } }));
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })); vi.stubGlobal('scrollTo', vi.fn());
    render(ui([available])); fireEvent.click(await screen.findByRole('checkbox', { name: 'Ana' })); fireEvent.click(screen.getByRole('checkbox', { name: 'Bea' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gustos' })); fireEvent.change(screen.getByLabelText('Formato'), { target: { value: 'book' } });
    await screen.findByLabelText('Agrupar por'); fireEvent.change(screen.getByLabelText('Agrupar por'), { target: { value: 'author' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lo que valoráis' })); fireEvent.click(screen.getByRole('button', { name: 'Explorar Autora' })); fireEvent.click(screen.getByRole('button', { name: 'Abrir obra: Libro' })); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Obras' })); await screen.findByRole('button', { name: 'Ana, Bea 0 obras comunes' });
    fireEvent.click(screen.getByRole('button', { name: 'Gustos' })); await screen.findByRole('button', { name: 'Volver a la categoría' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la categoría' }));
    expect((screen.getByLabelText('Agrupar por') as HTMLSelectElement).value).toBe('author'); expect((screen.getByLabelText('Formato') as HTMLSelectElement).value).toBe('book');
    expect(screen.getByRole('button', { name: 'Lo que valoráis' }).getAttribute('aria-pressed')).toBe('true'); expect(screen.getByText('Ana, Bea')).toBeTruthy();
    vi.unstubAllGlobals();
  });
  it('synchronizes a map pair with the participant controls before adding a third person', async () => {
    const available: Group = { ...first, members: ['Ana', 'Bea', 'Carlos'].map((name, index) => ({ slotId: `${index}`, userId: ['a', 'b', 'c'][index], name, avatarUrl: null, available: true })) };
    mocks.query = `group=${first.id}`; mocks.load.mockResolvedValue({ ok: true, data: snapshot(available) });
    render(ui([available]));
    fireEvent.click(await screen.findByRole('button', { name: 'Ana, Bea 0 obras comunes' }));
    expect((screen.getByRole('checkbox', { name: 'Ana' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Bea' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Carlos' }));
    expect(screen.getAllByRole('button', { name: /Abrir región:/ })).toHaveLength(7);
  });
  it('starts with no arbitrary selected group and lets keyboard users create one', () => {
    render(ui([])); expect(screen.getByText('Crea un grupo para empezar a comparar.')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Crear grupo' }); button.focus(); expect(document.activeElement).toBe(button);
    fireEvent.click(button); expect(screen.getByRole('textbox', { name: 'Nombre del grupo' })).toBeTruthy(); expect(mocks.load).not.toHaveBeenCalled();
  });
  it('clears old members immediately and ignores late replies after group change', async () => {
    let finish!: (value: Result<Snapshot>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ ok: true, data: snapshot(second) });
    render(ui()); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: first.id } });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: second.id } });
    await screen.findByText('Persona no disponible');
    await act(async () => finish({ ok: true, data: snapshot(first) }));
    expect((screen.getByLabelText('Grupo') as HTMLSelectElement).value).toBe(second.id);
    expect(mocks.replace).toHaveBeenLastCalledWith(`/comunidad/entre-nosotros?group=${second.id}`, { scroll: false });
  });
  it('removes all previous account evidence and does not accept its pending request', async () => {
    let finish!: (value: Result<Snapshot>) => void;
    mocks.load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const mounted = render(ui()); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: first.id } });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1)); mounted.rerender(ui([], 'new'));
    await act(async () => finish({ ok: true, data: snapshot(first) }));
    expect(screen.queryByText('Ana')).toBeNull(); expect(screen.getByText('Crea un grupo para empezar a comparar.')).toBeTruthy();
  });
  it.each(['SIGNED_OUT', 'SIGNED_IN', 'INITIAL_SESSION'])('invalidates evidence immediately on %s before the new SSR payload', async event => {
    mocks.query = `group=${first.id}`;
    let finish!: (value: Result<Snapshot>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const mounted = render(ui()); await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    act(() => mocks.auth!(event, event === 'SIGNED_OUT' ? null : { user: { id: 'another-account' } }));
    expect(screen.queryByLabelText('Grupo')).toBeNull(); expect(screen.getByText(messages.comparisons.sessionChanged)).toBeTruthy();
    await act(async () => finish({ ok: true, data: snapshot(first) })); expect(screen.queryByText('Ana')).toBeNull();
    mounted.unmount(); expect(mocks.unsubscribe).toHaveBeenCalled();
  });
  it('keeps evidence for repeated SIGNED_IN and token refresh of the same account', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    act(() => mocks.auth!('SIGNED_IN', { user: { id: 'a' } })); act(() => mocks.auth!('TOKEN_REFRESHED', { user: { id: 'a' } }));
    expect(screen.getByRole('checkbox', { name: 'Ana' })).toBeTruthy(); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('starts a fresh subtree after the same account authenticates again on the server', async () => {
    mocks.query = `group=${first.id}`;
    const mounted = render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    fireEvent.click(screen.getByLabelText('Ana')); fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' }));
    fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador antiguo' } });
    act(() => mocks.auth!('SIGNED_OUT', null)); expect(screen.queryByLabelText('Grupo')).toBeNull();
    mounted.rerender(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    expect((screen.getByLabelText('Ana') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText('Nombre del grupo')).toBeNull();
  });
  it('updates saved group data and uses its new revision on the next edit', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    const saved: Group = { ...first, name: 'Nombre nuevo', revision: 2, members: [first.members[0], { slotId: 'new-member', userId: 'b', name: 'Bea', avatarUrl: null, available: true }] };
    mocks.save.mockResolvedValue({ ok: true, data: saved }); mocks.load.mockResolvedValue({ ok: true, data: snapshot(saved) });
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' }));
    fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: saved.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar persona no disponible' }));
    fireEvent.click(within(screen.getByRole('form')).getByLabelText('Bea'));
    fireEvent.submit(screen.getByRole('form')); await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
    await screen.findByRole('heading', { name: saved.name });
    expect(mocks.save).toHaveBeenLastCalledWith({ id: first.id, name: saved.name, userIds: ['a', 'b'], expectedRevision: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith({ id: first.id, name: saved.name, userIds: ['a', 'b'], expectedRevision: 2 }));
  });
  it('deduplicates focus and visibility identity checks, hides evidence meanwhile and preserves the same-account draft', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador' } });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(mocks.getUser).toHaveBeenCalledOnce(); expect(screen.queryByRole('form')).toBeNull(); expect(screen.getByText(messages.comparisons.checkingSession)).toBeTruthy();
    await act(async () => finish({ data: { user: { id: 'a' } }, error: null }));
    expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Borrador');
  });
  it('uses fresh identity on focus to catch cookie changes that emitted no browser auth event', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'new-account' } }, error: null });
    act(() => window.dispatchEvent(new Event('focus'))); await screen.findByText(messages.comparisons.sessionChanged);
    expect(screen.queryByText('Ana')).toBeNull(); expect(screen.queryByLabelText('Grupo')).toBeNull();
  });
  it('keeps a failed identity check gated until successful retry and discards stale checks on unmount', async () => {
    mocks.query = `group=${first.id}`; const mounted = render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('offline') });
    act(() => window.dispatchEvent(new Event('focus'))); await screen.findByText(messages.comparisons.sessionCheckFailed);
    expect(screen.queryByRole('combobox', { name: 'Grupo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await screen.findByRole('combobox', { name: 'Grupo' });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); act(() => window.dispatchEvent(new Event('focus')));
    mounted.unmount(); await act(async () => finish({ data: { user: { id: 'another' } }, error: null }));
    expect(mocks.refresh).not.toHaveBeenCalled();
    const before = mocks.getUser.mock.calls.length; act(() => window.dispatchEvent(new Event('focus'))); expect(mocks.getUser.mock.calls.length).toBe(before);
  });
  it('accepts a freshly authenticated server payload and ignores the previous identity check', async () => {
    mocks.query = `group=${first.id}`; const mounted = render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.queryByRole('combobox', { name: 'Grupo' })).toBeNull(); mounted.rerender(ui());
    await screen.findByRole('combobox', { name: 'Grupo' });
    await act(async () => finish({ data: { user: { id: 'old-check' } }, error: null }));
    expect(screen.queryByText(messages.comparisons.sessionChanged)).toBeNull(); expect(screen.getByRole('combobox', { name: 'Grupo' })).toBeTruthy();
  });
  it('renders load conflict as reload and clears previous evidence while refreshing permissions', async () => {
    render(ui()); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: first.id } }); await screen.findByText('Persona no disponible');
    mocks.load.mockResolvedValueOnce({ ok: false, code: 'conflict' });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar acceso' }));
    expect(screen.queryByText('Persona no disponible')).toBeNull(); await screen.findByText(messages.comparisons.loadConflict);
    expect(screen.getByRole('button', { name: 'Recargar comparación' })).toBeTruthy(); expect(screen.queryByText('0 obras')).toBeNull();
  });
  it('shows read errors as errors and restores normal load on retry', async () => {
    mocks.load.mockResolvedValueOnce({ ok: false, code: 'load-failed' }); render(ui());
    fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: first.id } }); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Recargar comparación' })); await screen.findByText('Persona no disponible');
  });
  it('ignores a forged group query and selects an owned valid UUID', async () => {
    mocks.query = 'group=cccccccc-cccc-cccc-cccc-cccccccccccc'; const mounted = render(ui()); expect(mocks.load).not.toHaveBeenCalled();
    mounted.unmount(); mocks.query = `group=${first.id}`; render(ui()); await screen.findByText('Persona no disponible'); expect(mocks.load).toHaveBeenCalledWith(first.id, 'all');
  });
  it('starts each section with all formats and restores the previous section filter', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    fireEvent.change(screen.getByLabelText('Formato'), { target: { value: 'book' } });
    await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(first.id, 'book'));
    fireEvent.click(screen.getByRole('button', { name: 'Gustos' }));
    expect((screen.getByLabelText('Formato') as HTMLSelectElement).value).toBe('all');
    await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(first.id, 'all'));
    fireEvent.click(screen.getByRole('button', { name: 'Obras' }));
    expect((screen.getByLabelText('Formato') as HTMLSelectElement).value).toBe('book');
    await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(first.id, 'book'));
  });
});
