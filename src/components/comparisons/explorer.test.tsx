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
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter, useSearchParams: () => new URLSearchParams(mocks.query), usePathname: () => '/comunidad/entre-nosotros' }));
import { Explorer, explorerReducer } from './explorer';
import { initialState } from './state';
import type { ExplorerState, View } from './state';
const group = (suffix: string, name: string): Group => ({ id: `${suffix.repeat(8)}-${suffix.repeat(4)}-${suffix.repeat(4)}-${suffix.repeat(4)}-${suffix.repeat(12)}`, name, revision: 1, members: [{ slotId: 'one', userId: 'a', name: 'Ana', avatarUrl: null, available: true }, { slotId: 'two', userId: null, name: null, avatarUrl: null, available: false }] });
const first = group('a', 'Lectores'); const second = group('b', 'Cine');
const snapshot = (g: Group): Snapshot => ({ group: g, format: 'all', catalog: [], works: [], excludedSeriesWithoutEpisodes: 0 });
function ui(groups = [first, second], viewerId = 'a') { return <NextIntlClientProvider locale="es" messages={messages}><Explorer initialGroups={groups} candidates={[{ userId: 'a', name: 'Ana', avatarUrl: null }, { userId: 'b', name: 'Bea', avatarUrl: null }]} viewerId={viewerId}/></NextIntlClientProvider>; }
let cookieTurn = 0;
// Another tab's login/logout rewrites the shared Supabase session cookies.
function rotateSessionCookies() { cookieTurn += 1; document.cookie = `sb-test-auth-token=turn-${cookieTurn}; path=/`; }
beforeEach(() => {
  // jsdom does not implement <dialog>.showModal; the editor sheet opens with it.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  document.cookie = 'sb-test-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'; vi.clearAllMocks(); mocks.query = ''; mocks.load.mockResolvedValue({ ok: true, data: snapshot(first) }); mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'a' } }, error: null }); });
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
  const book = { catalog: { key: 'book:x' as const, title: 'Libro', coverUrl: null, genres: ['Ensayo'], creators: [] }, work: { key: 'book:x' as const, userId: 'a', rating: null, orderUnknown: false, progress: null } };
  const movie = { catalog: { key: 'movie:y' as const, title: 'Película', coverUrl: null, genres: ['Drama'], creators: [] }, work: { key: 'movie:y' as const, userId: 'a', rating: null, orderUnknown: false, progress: null } };
  const bookSnapshot: Snapshot = { ...snapshot(availableGroup), format: 'book', catalog: [book.catalog], works: [book.work] };
  // Every request is `all`; each section's format is derived from it (#1481).
  const allSnapshot: Snapshot = { ...snapshot(availableGroup), format: 'all', catalog: [book.catalog, movie.catalog], works: [book.work, movie.work], excludedSeriesWithoutEpisodes: 2 };
  const stateFor = (section: 'works' | 'tastes', views: ExplorerState['views']): ExplorerState => ({ ...initialState('a'), section, formats: { works: 'book', tastes: 'movie' }, views, selection: ['a', 'b'], snapshot: { seq: 2, value: null, status: 'loading' } });
  it.each<View>([
    { level: 'facet', people: ['a', 'b'], facetKind: 'genre', facetId: 'Drama' },
    { level: 'work', people: ['a', 'b'], origin: { kind: 'facet', facetKind: 'genre', facetId: 'Drama' }, key: 'movie:y' },
  ])('retains the inactive movie context %j through the book view and restores it from the same load', tasteView => {
    const state = stateFor('works', { works: { level: 'group' }, tastes: tasteView });
    const books = explorerReducer(state, { type: 'response', seq: 2, result: { ok: true, data: allSnapshot } });
    expect(books.views.tastes).toEqual(tasteView); expect(books.snapshot.value).toEqual({ ...bookSnapshot, excludedSeriesWithoutEpisodes: 0 });
    const switched = explorerReducer(books, { type: 'section', section: 'tastes' });
    expect(switched.snapshot.status).toBe('ready'); expect(switched.snapshot.value!.format).toBe('movie');
    expect(switched.snapshot.value!.works.map(work => work.key)).toEqual(['movie:y']); expect(switched.views.tastes).toEqual(tasteView);
  });
  it('preserves an inactive book work/region origin while the movie section loads', () => {
    const bookView: View = { level: 'work', people: ['a', 'b'], origin: { kind: 'region', mask: 1 }, key: 'book:x' };
    const state = stateFor('tastes', { works: bookView, tastes: { level: 'group' } });
    expect(explorerReducer(state, { type: 'response', seq: 2, result: { ok: true, data: allSnapshot } }).views.works).toEqual(bookView);
  });
  it('invalidates inactive contexts and selection when a participant loses access', () => {
    const tasteView: View = { level: 'work', people: ['a', 'b'], origin: { kind: 'facet', facetKind: 'genre', facetId: 'Drama' }, key: 'movie:y' };
    const state = stateFor('works', { works: { level: 'venn', people: ['a', 'b'] }, tastes: tasteView });
    const revoked: Snapshot = { ...allSnapshot, group: { ...availableGroup, members: [availableGroup.members[0], { slotId: 'two', userId: null, name: null, avatarUrl: null, available: false }] } };
    const next = explorerReducer(state, { type: 'response', seq: 2, result: { ok: true, data: revoked } });
    expect(next.views).toEqual({ works: { level: 'group' }, tastes: { level: 'group' } }); expect(next.selection).toEqual(['a']);
  });
  it('validates the active facet against its own derived format', () => {
    const state = stateFor('tastes', { works: { level: 'group' }, tastes: { level: 'facet', people: ['a', 'b'], facetKind: 'genre', facetId: 'Gone' } });
    expect(explorerReducer(state, { type: 'response', seq: 2, result: { ok: true, data: allSnapshot } }).views.tastes).toEqual({ level: 'group' });
  });
  it('derives a format switch from the loaded source without a new load or a loader hand-off', () => {
    const ready = explorerReducer(stateFor('works', { works: { level: 'group' }, tastes: { level: 'group' } }), { type: 'response', seq: 2, result: { ok: true, data: allSnapshot } });
    expect(ready.revealSeq).toBe(2);
    const all = explorerReducer(ready, { type: 'format', format: 'all' });
    expect(all.snapshot).toEqual({ seq: 3, value: allSnapshot, status: 'ready' }); expect(all.revealSeq).toBe(2);
    const series = explorerReducer(all, { type: 'format', format: 'series' });
    expect(series.snapshot.value).toMatchObject({ format: 'series', works: [], catalog: [], excludedSeriesWithoutEpisodes: 2 });
    expect(explorerReducer(series, { type: 'refresh' }).source).toBeNull();
  });
  it('keeps a load in flight across format and section changes and derives the format current on arrival', () => {
    const loading = stateFor('works', { works: { level: 'group' }, tastes: { level: 'group' } });
    const moved = explorerReducer(explorerReducer(loading, { type: 'format', format: 'movie' }), { type: 'section', section: 'tastes' });
    expect(moved.snapshot).toEqual(loading.snapshot);
    const arrived = explorerReducer(explorerReducer(moved, { type: 'format', format: 'book' }), { type: 'response', seq: 2, result: { ok: true, data: allSnapshot } });
    expect(arrived.snapshot.value!.format).toBe('book'); expect(arrived.source).toBe(allSnapshot);
  });
  it('validates a retained destination view on switching sections when its format is already loaded', () => {
    const state: ExplorerState = { ...stateFor('works', { works: { level: 'group' }, tastes: { level: 'facet', people: ['a', 'b'], facetKind: 'genre', facetId: 'Gone' } }), formats: { works: 'book', tastes: 'book' }, snapshot: { seq: 2, value: bookSnapshot, status: 'ready' } };
    expect(explorerReducer(state, { type: 'section', section: 'tastes' }).views.tastes).toEqual({ level: 'group' });
  });
});
describe('Explorer request boundaries', () => {
  it('hands the loader to fresh content without blocking focus or announcing a completed load', async () => {
    mocks.query = `group=${first.id}`;
    let finish!: (value: Result<Snapshot>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { container } = render(ui());
    expect(screen.getByRole('status').textContent).toContain(messages.comparisons.loading);
    await act(async () => finish({ ok: true, data: snapshot(first) }));
    expect(screen.queryByRole('status')).toBeNull();
    const handoff = container.querySelector('[data-comparison-handoff]')!;
    expect(handoff).not.toBeNull();
    expect(handoff.getAttribute('aria-hidden')).toBe('true');
    expect(handoff.hasAttribute('inert')).toBe(true);
    const refresh = screen.getByRole('button', { name: 'Actualizar acceso' });
    refresh.focus(); expect(document.activeElement).toBe(refresh);
    expect(container.querySelector('[data-comparison-slot="works"]')).not.toBeNull();
    // JSDOM has no AnimationEvent, so React selects the prefixed DOM event.
    const animationEnd = () => new Event('AnimationEvent' in window ? 'animationend' : 'webkitAnimationEnd', { bubbles: true });
    fireEvent(handoff.querySelector('svg')!, animationEnd());
    expect(container.querySelector('[data-comparison-handoff]')).toBe(handoff);
    fireEvent(handoff, animationEnd());
    expect(container.querySelector('[data-comparison-handoff]')).toBeNull();
    expect(document.activeElement).toBe(refresh);
  });
  it('discards fading evidence on refresh and accepts only the most recent load', async () => {
    mocks.query = `group=${first.id}`;
    const { container } = render(ui());
    await screen.findByRole('checkbox', { name: 'Ana' });
    expect(container.querySelector('[data-comparison-handoff]')).not.toBeNull();
    let finishOld!: (value: Result<Snapshot>) => void;
    let finishNew!: (value: Result<Snapshot>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar acceso' }));
    expect(container.querySelector('[data-comparison-handoff]')).toBeNull();
    expect(container.querySelector('[data-comparison-slot]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: second.id } });
    await act(async () => finishOld({ ok: true, data: snapshot(first) }));
    expect(container.querySelector('[data-comparison-slot]')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(messages.comparisons.loading);
    await act(async () => finishNew({ ok: true, data: snapshot(second) }));
    expect(screen.getByRole('heading', { name: second.name })).toBeTruthy();
    expect(container.querySelector('[data-comparison-handoff]')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('drops both the fade and fresh evidence immediately when the account signs out', async () => {
    mocks.query = `group=${first.id}`;
    const { container } = render(ui());
    await screen.findByRole('checkbox', { name: 'Ana' });
    expect(container.querySelector('[data-comparison-handoff]')).not.toBeNull();
    act(() => mocks.auth!('SIGNED_OUT', null));
    expect(container.querySelector('[data-comparison-handoff]')).toBeNull();
    expect(container.querySelector('[data-comparison-slot]')).toBeNull();
    expect(screen.getByText(messages.comparisons.sessionChanged)).toBeTruthy();
  });
  it('discloses loaded-group histories with zero eligible works and an unavailable participant', async () => {
    mocks.query = `group=${first.id}`;
    mocks.load.mockResolvedValue({ ok: true, data: { ...snapshot(first), excludedSeriesWithoutEpisodes: 2 } });
    render(ui());
    const notice = await screen.findByText(/2 historiales de persona y serie del grupo cargado/);
    expect(notice.textContent).toContain('sin episodios registrados');
    fireEvent.click(screen.getByRole('button', { name: 'Gustos' }));
    expect(screen.getByText(/2 historiales de persona y serie del grupo cargado/)).toBeTruthy();
    expect(screen.getByText(/Selecciona entre 2 y 10/)).toBeTruthy();
  });
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
    render(ui([])); expect(screen.getByText('Compara con quien sigues')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Crear grupo' }); button.focus(); expect(document.activeElement).toBe(button);
    fireEvent.click(button); expect(screen.getByRole('textbox', { name: 'Nombre del grupo' })).toBeTruthy(); expect(mocks.load).not.toHaveBeenCalled();
  });
  it('offers a primary create action in the empty state, or people to follow when there is nobody to compare with', () => {
    const mounted = render(ui([]));
    fireEvent.click(screen.getByRole('button', { name: 'Crear tu primer grupo' }));
    expect(screen.getByRole('dialog', { name: 'Crear grupo' })).toBeTruthy();
    mounted.unmount();
    render(<NextIntlClientProvider locale="es" messages={messages}><Explorer initialGroups={[]} candidates={[{ userId: 'a', name: 'Ana', avatarUrl: null }]} viewerId="a"/></NextIntlClientProvider>);
    expect(screen.getByText('Aún no sigues a nadie')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Buscar personas' }).getAttribute('href')).toBe('/comunidad?tab=personas');
    expect(screen.queryByRole('button', { name: 'Crear tu primer grupo' })).toBeNull();
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
    expect(screen.queryByText('Ana')).toBeNull(); expect(screen.getByText('Compara con quien sigues')).toBeTruthy();
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
    const saved: Group = { ...first, name: 'Ateneo', revision: 2, members: [first.members[0], { slotId: 'new-member', userId: 'b', name: 'Bea', avatarUrl: null, available: true }] };
    mocks.save.mockResolvedValue({ ok: true, data: saved }); mocks.load.mockResolvedValue({ ok: true, data: snapshot(saved) });
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' }));
    fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: saved.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar persona no disponible' }));
    fireEvent.click(within(screen.getByRole('form')).getByRole('checkbox', { name: 'Bea' }));
    fireEvent.submit(screen.getByRole('form')); await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
    await screen.findByRole('heading', { name: saved.name });
    // A rename re-sorts the selector instead of moving the group to the end.
    expect(within(screen.getByRole('combobox', { name: 'Grupo' })).getAllByRole('option').map(option => option.textContent)).toEqual(['Elige un grupo', 'Ateneo', 'Cine']);
    expect(mocks.save).toHaveBeenLastCalledWith({ id: first.id, name: saved.name, userIds: ['a', 'b'], expectedRevision: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith({ id: first.id, name: saved.name, userIds: ['a', 'b'], expectedRevision: 2 }));
  });
  it('keeps evidence, scroll extent and draft visible while unchanged session cookies are verified in the background', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador' } });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(mocks.getUser).toHaveBeenCalledOnce(); expect(screen.getByRole('form')).toBeTruthy();
    expect(screen.queryByText(messages.comparisons.checkingSession)).toBeNull();
    await act(async () => finish({ data: { user: { id: 'a' } }, error: null }));
    expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Borrador');
  });
  it('hides evidence synchronously when session cookies change even behind a quiet check in flight', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    let finishQuiet!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finishQuiet = resolve; }))
      .mockResolvedValueOnce({ data: { user: { id: 'b' } }, error: null });
    act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.getByRole('combobox', { name: 'Grupo' })).toBeTruthy();
    rotateSessionCookies(); act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.queryByRole('combobox', { name: 'Grupo' })).toBeNull(); expect(screen.getByText(messages.comparisons.checkingSession)).toBeTruthy();
    await act(async () => finishQuiet({ data: { user: { id: 'a' } }, error: null }));
    await screen.findByText(messages.comparisons.sessionChanged); expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });
  it('deduplicates focus and visibility identity checks, hides evidence meanwhile and preserves the same-account draft', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador' } });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    rotateSessionCookies(); act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
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
  it.each(['resolve', 'error', 'reject'])('discards an older %s completion and coalesces a fresh check without reopening A', async completion => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    type Answer = { data: { user: { id: string } }; error: Error | null };
    let finishOld!: (answer: Answer) => void, rejectOld!: (error: Error) => void, finishFresh!: (answer: Answer) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise((resolve, reject) => { finishOld = resolve; rejectOld = reject; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishFresh = resolve; }));
    rotateSessionCookies(); act(() => window.dispatchEvent(new Event('focus')));
    act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    await act(async () => {
      if (completion === 'reject') rejectOld(new Error('old request rejected'));
      else finishOld({ data: { user: { id: 'a' } }, error: completion === 'error' ? new Error('old error') : null });
    });
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(screen.getByText(messages.comparisons.checkingSession)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Grupo' })).toBeNull();
    expect(screen.queryByText(messages.comparisons.sessionCheckFailed)).toBeNull();
    await act(async () => finishFresh({ data: { user: { id: 'b' } }, error: null }));
    expect(screen.getByText(messages.comparisons.sessionChanged)).toBeTruthy();
    expect(screen.queryByLabelText('Grupo')).toBeNull();
    act(() => window.dispatchEvent(new Event('focus'))); expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });
  it('keeps the same-account draft hidden until its queued fresh answer completes', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador' } });
    type Answer = { data: { user: { id: string } }; error: null };
    let finishOld!: (answer: Answer) => void, finishFresh!: (answer: Answer) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishFresh = resolve; }));
    rotateSessionCookies(); act(() => window.dispatchEvent(new Event('focus'))); act(() => window.dispatchEvent(new Event('focus')));
    await act(async () => finishOld({ data: { user: { id: 'a' } }, error: null }));
    expect(mocks.getUser).toHaveBeenCalledTimes(2); expect(screen.queryByRole('form')).toBeNull();
    await act(async () => finishFresh({ data: { user: { id: 'a' } }, error: null }));
    expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Borrador');
  });
  it.each(['unmount', 'auth-invalidation'])('does not launch queued verification after %s', async end => {
    mocks.query = `group=${first.id}`; const mounted = render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    let finish!: (answer: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
    if (end === 'unmount') mounted.unmount(); else act(() => mocks.auth!('SIGNED_OUT', null));
    await act(async () => finish({ data: { user: { id: 'a' } }, error: null }));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(mocks.getUser).toHaveBeenCalledOnce();
    if (end === 'unmount') expect(mocks.refresh).not.toHaveBeenCalled();
    else expect(screen.queryByLabelText('Grupo')).toBeNull();
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
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); rotateSessionCookies(); act(() => window.dispatchEvent(new Event('focus')));
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
    fireEvent.click(screen.getByRole('button', { name: 'Gustos' }));
    expect((screen.getByLabelText('Formato') as HTMLSelectElement).value).toBe('all');
    fireEvent.click(screen.getByRole('button', { name: 'Obras' }));
    expect((screen.getByLabelText('Formato') as HTMLSelectElement).value).toBe('book');
    // Formats and sections derive from the one `all` load (#1481).
    expect(mocks.load.mock.calls).toEqual([[first.id, 'all']]);
  });
  it('retries the load on a format change after a failed load', async () => {
    mocks.query = `group=${first.id}`; mocks.load.mockResolvedValueOnce({ ok: false, code: 'load-failed' }); render(ui());
    await screen.findByRole('button', { name: 'Recargar comparación' });
    const pills = screen.getByRole('group', { name: 'Filtrar por tipo de obra' });
    fireEvent.click(within(pills).getByRole('button', { name: 'Libros' }));
    await screen.findByRole('checkbox', { name: 'Ana' }); expect(mocks.load.mock.calls).toEqual([[first.id, 'all'], [first.id, 'all']]);
    expect(within(pills).getByRole('button', { name: 'Libros' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('keeps visible format pills and the native selector synchronized through one request state', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('checkbox', { name: 'Ana' });
    const pills = screen.getByRole('group', { name: 'Filtrar por tipo de obra' });
    fireEvent.click(within(pills).getByRole('button', { name: 'Películas' }));
    expect((screen.getByLabelText('Formato') as HTMLSelectElement).value).toBe('movie');
    fireEvent.change(screen.getByLabelText('Formato'), { target: { value: 'series' } });
    expect(within(pills).getByRole('button', { name: 'Series' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(pills).getByRole('button', { name: 'Películas' }).getAttribute('aria-pressed')).toBe('false');
    expect(mocks.load.mock.calls).toEqual([[first.id, 'all']]);
  });
});
