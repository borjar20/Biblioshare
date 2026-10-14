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
// Group actions and the group select live in the group sheet, opened from its chip.
const openGroupSheet = () => fireEvent.click(screen.getByRole('button', { name: /^Grupo: / }));
const loadingStatuses = () => screen.queryAllByRole('status').filter(status => status.textContent?.includes(messages.comparisons.loading));
let cookieTurn = 0;
// Another tab's login/logout rewrites the shared Supabase session cookies.
function rotateSessionCookies() { cookieTurn += 1; document.cookie = `sb-test-auth-token=turn-${cookieTurn}; path=/`; }
beforeEach(() => {
  // jsdom does not implement <dialog>.showModal; the editor sheet opens with it.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  // The atlas engine draws on a <canvas>; jsdom has no 2D context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  // Faces and camera are remembered per group for the tab: each test starts with none.
  sessionStorage.clear();
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
  const book = { catalog: { key: 'book:x' as const, title: 'Libro', coverUrl: null, genres: ['Ensayo'], creators: [] }, work: { key: 'book:x' as const, userId: 'a', rating: null, date: null, orderUnknown: false, progress: null } };
  const movie = { catalog: { key: 'movie:y' as const, title: 'Película', coverUrl: null, genres: ['Drama'], creators: [] }, work: { key: 'movie:y' as const, userId: 'a', rating: null, date: null, orderUnknown: false, progress: null } };
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
    // The atlas summary is a permanent status; none may announce loading.
    expect(loadingStatuses()).toEqual([]);
    const handoff = container.querySelector('[data-comparison-handoff]')!;
    expect(handoff).not.toBeNull();
    expect(handoff.getAttribute('aria-hidden')).toBe('true');
    expect(handoff.hasAttribute('inert')).toBe(true);
    openGroupSheet(); const refresh = screen.getByRole('button', { name: 'Actualizar' });
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
    await screen.findByRole('button', { name: 'Tú' });
    expect(container.querySelector('[data-comparison-handoff]')).not.toBeNull();
    let finishOld!: (value: Result<Snapshot>) => void;
    let finishNew!: (value: Result<Snapshot>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
    openGroupSheet(); fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(container.querySelector('[data-comparison-handoff]')).toBeNull();
    expect(container.querySelector('[data-comparison-slot]')).toBeNull();
    openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: second.id } });
    await act(async () => finishOld({ ok: true, data: snapshot(first) }));
    expect(container.querySelector('[data-comparison-slot]')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(messages.comparisons.loading);
    await act(async () => finishNew({ ok: true, data: snapshot(second) }));
    expect(screen.getByRole('heading', { name: second.name })).toBeTruthy();
    expect(container.querySelector('[data-comparison-handoff]')).not.toBeNull();
    expect(loadingStatuses()).toEqual([]);
  });
  it('drops both the fade and fresh evidence immediately when the account signs out', async () => {
    mocks.query = `group=${first.id}`;
    const { container } = render(ui());
    await screen.findByRole('button', { name: 'Tú' });
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
    expect(screen.getByText('Persona no disponible')).toBeTruthy();
  });
  it('keeps atlas faces across a format change and starts a new group with everyone', async () => {
    const members = (g: Group): Group => ({ ...g, members: ['Ana', 'Bea', 'Carlos'].map((name, i) => ({ slotId: `${i}`, userId: ['a', 'b', 'c'][i], name, avatarUrl: null, available: true })) });
    const groups = [members(first), members(second)];
    const book = { key: 'book:x' as const, title: 'Libro', coverUrl: null, genres: [], creators: [] };
    mocks.query = `group=${first.id}`;
    mocks.load.mockImplementation(async (id: string) => ({ ok: true, data: { ...snapshot(groups.find(g => g.id === id)!), catalog: [book],
      works: ['a', 'b', 'c'].map(userId => ({ userId, key: 'book:x', rating: null, date: null, orderUnknown: false, progress: null })) } }));
    render(ui(groups)); await screen.findByRole('button', { name: 'Tú' });
    fireEvent.click(screen.getByRole('button', { name: 'Carlos' }));
    expect(screen.getByRole('button', { name: 'Carlos' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtrar por tipo de obra' })).getByRole('button', { name: 'Libros' }));
    expect(screen.getByRole('button', { name: 'Carlos' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Tú' }).getAttribute('aria-pressed')).toBe('true');
    openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: second.id } });
    await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(second.id, 'all'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Carlos' }).getAttribute('aria-pressed')).toBe('true'));
  });
  it('keeps the atlas lens across a format change', async () => {
    const members = (g: Group): Group => ({ ...g, members: ['Ana', 'Bea'].map((name, i) => ({ slotId: `${i}`, userId: ['a', 'b'][i], name, avatarUrl: null, available: true })) });
    const book = { key: 'book:x' as const, title: 'Libro', coverUrl: null, genres: [], creators: [] };
    mocks.query = `group=${first.id}`;
    mocks.load.mockImplementation(async () => ({ ok: true, data: { ...snapshot(members(first)), catalog: [book],
      works: ['a', 'b'].map(userId => ({ userId, key: 'book:x', rating: 8, date: null, orderUnknown: false, progress: null })) } }));
    render(ui([members(first)])); await screen.findByRole('button', { name: 'Tú' });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    expect(screen.getByRole('button', { name: 'Opinión' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtrar por tipo de obra' })).getByRole('button', { name: 'Libros' }));
    expect(within(screen.getByRole('group', { name: 'Filtrar por tipo de obra' })).getByRole('button', { name: 'Libros' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Opinión' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('keeps the islands mode across a format change, like the lens', async () => {
    const members = (g: Group): Group => ({ ...g, members: ['Ana', 'Bea'].map((name, i) => ({ slotId: `${i}`, userId: ['a', 'b'][i], name, avatarUrl: null, available: true })) });
    const book = { key: 'book:x' as const, title: 'Libro', coverUrl: null, genres: ['Drama'], creators: [] };
    mocks.query = `group=${first.id}`;
    mocks.load.mockImplementation(async () => ({ ok: true, data: { ...snapshot(members(first)), catalog: [book],
      works: ['a', 'b'].map(userId => ({ userId, key: 'book:x', rating: null, date: null, orderUnknown: false, progress: null })) } }));
    render(ui([members(first)])); await screen.findByRole('button', { name: 'Tú' });
    fireEvent.click(screen.getByRole('button', { name: 'Islas' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Agrupar islas por' })).getByRole('button', { name: 'Autor/Director' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtrar por tipo de obra' })).getByRole('button', { name: 'Libros' }));
    expect(within(screen.getByRole('group', { name: 'Filtrar por tipo de obra' })).getByRole('button', { name: 'Libros' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Islas' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(screen.getByRole('group', { name: 'Agrupar islas por' })).getByRole('button', { name: 'Autor/Director' }).getAttribute('aria-pressed')).toBe('true');
  });
  describe('atlas state in the URL and per group in sessionStorage', () => {
    const pair = (g: Group): Group => ({ ...g, members: ['Ana', 'Bea', 'Carlos'].map((name, i) => ({ slotId: `${i}`, userId: ['a', 'b', 'c'][i], name, avatarUrl: null, available: true })) });
    const loadPair = (groups: Group[]) => mocks.load.mockImplementation(async (id: string) => ({ ok: true, data: { ...snapshot(groups.find(g => g.id === id)!),
      catalog: [{ key: 'book:x' as const, title: 'Libro', coverUrl: null, genres: ['Drama'], creators: [] }],
      works: ['a', 'b', 'c'].map(userId => ({ userId, key: 'book:x', rating: null, date: null, orderUnknown: false, progress: null })) } }));
    it('mounts with ?lente=islas&islas=genero showing Islas and Género pressed', async () => {
      const groups = [pair(first)]; loadPair(groups);
      mocks.query = `group=${first.id}&lente=islas&islas=genero`;
      render(ui(groups)); await screen.findByRole('button', { name: 'Tú' });
      expect(screen.getByRole('button', { name: 'Islas' }).getAttribute('aria-pressed')).toBe('true');
      expect(within(screen.getByRole('group', { name: 'Agrupar islas por' })).getByRole('button', { name: 'Género' }).getAttribute('aria-pressed')).toBe('true');
    });
    it('writes the lens and the islands mode with router.replace, keeping the group, and keeps them when the group changes', async () => {
      const groups = [pair(first), pair(second)]; loadPair(groups);
      mocks.query = `group=${first.id}`;
      render(ui(groups)); await screen.findByRole('button', { name: 'Tú' });
      fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
      expect(mocks.replace).toHaveBeenLastCalledWith(`/comunidad/entre-nosotros?group=${first.id}&lente=opinion`, { scroll: false });
      fireEvent.click(screen.getByRole('button', { name: 'Islas' }));
      fireEvent.click(within(screen.getByRole('group', { name: 'Agrupar islas por' })).getByRole('button', { name: 'Autor/Director' }));
      expect(mocks.replace).toHaveBeenLastCalledWith(`/comunidad/entre-nosotros?group=${first.id}&lente=islas&islas=autor`, { scroll: false });
      openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: second.id } });
      expect(mocks.replace).toHaveBeenLastCalledWith(`/comunidad/entre-nosotros?group=${second.id}&lente=islas&islas=autor`, { scroll: false });
      // No person id ever reaches the URL.
      for (const [url] of mocks.replace.mock.calls) expect(url).not.toMatch(/[?&](?:caras|faces|people)=/);
    });
    it('remembers the faces per group across a remount, and another group still starts with everyone', async () => {
      const groups = [pair(first), pair(second)]; loadPair(groups);
      const data = new Map<string, string>();
      vi.stubGlobal('sessionStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } });
      try {
        mocks.query = `group=${first.id}`;
        const mounted = render(ui(groups)); await screen.findByRole('button', { name: 'Tú' });
        fireEvent.click(screen.getByRole('button', { name: 'Carlos' }));
        expect([...data.keys()]).toContain(`biblioshare:atlas:a:${first.id}`);
        expect(data.get(`biblioshare:atlas:a:${first.id}`)).toContain('"faces"');
        mounted.unmount();
        render(ui(groups)); await screen.findByRole('button', { name: 'Tú' });
        expect(screen.getByRole('button', { name: 'Carlos' }).getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByRole('button', { name: 'Bea' }).getAttribute('aria-pressed')).toBe('true');
        openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: second.id } });
        await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(second.id, 'all'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Carlos' }).getAttribute('aria-pressed')).toBe('true'));
        // Back to the first group: its faces come back from memory.
        openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: first.id } });
        await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(first.id, 'all'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Carlos' }).getAttribute('aria-pressed')).toBe('false'));
      } finally { vi.unstubAllGlobals(); }
    });
    it('never restores another account’s memory for the same unsaved pair on the same tab', async () => {
      const bea = '10000000-0000-4000-8000-000000000002';
      const pairId = `with:${bea}`;
      mocks.query = `con=${bea}`;
      mocks.load.mockImplementation(async () => ({ ok: true, data: { group: { id: pairId, name: 'Par', revision: 1, members: [
        { slotId: 'self', userId: 'self', name: 'Yo', avatarUrl: null, available: true }, { slotId: 'with', userId: bea, name: 'Bea', avatarUrl: null, available: true }] },
        format: 'all', excludedSeriesWithoutEpisodes: 0, catalog: [{ key: 'book:x', title: 'Libro', coverUrl: null, genres: [], creators: [] }],
        works: ['self', bea].map(userId => ({ userId, key: 'book:x', rating: null, date: null, orderUnknown: false, progress: null })) } }));
      // Account «a» left only Bea on, with a camera, for its pair with Bea.
      sessionStorage.setItem(`biblioshare:atlas:a:${pairId}`, JSON.stringify({ faces: [bea], camera: { lens: 'quien', x: 1, y: 2, k: 3 } }));
      const pairUi = (viewerId: string) => <NextIntlClientProvider locale="es" messages={messages}><Explorer initialGroups={[]}
        candidates={[{ userId: viewerId, name: 'Yo', avatarUrl: null }, { userId: bea, name: 'Bea', avatarUrl: null }]} viewerId={viewerId}/></NextIntlClientProvider>;
      const asA = render(pairUi('a')); await screen.findByRole('button', { name: 'Bea' });
      // Sanity: «a» gets its own memory back (the viewer's own face is off).
      const pressed = () => within(screen.getByRole('group', { name: 'Personas del cruce' })).getAllByRole('button').map(button => button.getAttribute('aria-pressed'));
      expect(pressed()).toEqual(['false', 'true']);
      asA.unmount();
      render(pairUi('z')); await screen.findByRole('button', { name: 'Bea' });
      expect(pressed()).toEqual(['true', 'true']);
      expect(sessionStorage.getItem(`biblioshare:atlas:z:${pairId}`) ?? '').not.toContain('"x":1,"y":2,"k":3');
    });
    it('clears every atlas memory when the session boundary invalidates (sign-out or account change)', async () => {
      sessionStorage.setItem(`biblioshare:atlas:a:${first.id}`, JSON.stringify({ faces: ['a'] }));
      sessionStorage.setItem('biblioshare:atlas:b:with:x', JSON.stringify({ faces: ['b'] }));
      sessionStorage.setItem('other:key', '1');
      render(ui()); await waitFor(() => expect(mocks.auth).not.toBeNull());
      act(() => mocks.auth!('SIGNED_OUT', null));
      expect(sessionStorage.getItem(`biblioshare:atlas:a:${first.id}`)).toBeNull();
      expect(sessionStorage.getItem('biblioshare:atlas:b:with:x')).toBeNull();
      expect(sessionStorage.getItem('other:key')).toBe('1');
    });
  });
  it('starts with no arbitrary selected group and lets keyboard users create one', () => {
    render(ui([])); expect(screen.getByText('Compara con quien sigues')).toBeTruthy();
    openGroupSheet(); const button = screen.getByRole('button', { name: 'Crear grupo' }); button.focus(); expect(document.activeElement).toBe(button);
    fireEvent.click(button); expect(screen.getByRole('textbox', { name: 'Nombre del grupo' })).toBeTruthy(); expect(mocks.load).not.toHaveBeenCalled();
  });
  it('opens an unsaved pair from ?con= for an accepted follow and offers to save it with both people (#1484)', async () => {
    const bea = '10000000-0000-4000-8000-000000000002';
    mocks.query = `con=${bea}`;
    render(<NextIntlClientProvider locale="es" messages={messages}><Explorer initialGroups={[]} candidates={[{ userId: 'a', name: 'Ana', avatarUrl: null }, { userId: bea, name: 'Bea', avatarUrl: null }]} viewerId="a"/></NextIntlClientProvider>);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith(`with:${bea}`, 'all'));
    openGroupSheet(); const select = screen.getByRole('combobox', { name: 'Grupo' }) as HTMLSelectElement;
    expect(select.value).toBe(`with:${bea}`); expect(select.selectedOptions[0].textContent).toBe('Tú y Bea · sin guardar');
    expect(screen.queryByText('Compara con quien sigues')).toBeNull(); expect(screen.queryByRole('button', { name: 'Editar grupo' })).toBeNull();
    openGroupSheet(); fireEvent.click(screen.getByRole('button', { name: 'Guardar como grupo' }));
    const sheet = screen.getByRole('dialog', { name: 'Crear grupo' });
    expect((within(sheet).getByRole('textbox', { name: 'Nombre del grupo' }) as HTMLInputElement).value).toBe('Tú y Bea');
    expect((within(sheet).getByRole('checkbox', { name: 'Bea' }) as HTMLInputElement).checked).toBe(true);
  });
  it('ignores ?con= for someone who is not an accepted follow', () => {
    mocks.query = 'con=10000000-0000-4000-8000-000000000099'; render(ui([]));
    expect(mocks.load).not.toHaveBeenCalled(); expect(screen.getByText('Compara con quien sigues')).toBeTruthy();
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
    render(ui()); openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: first.id } });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: second.id } });
    await screen.findByText('Persona no disponible');
    await act(async () => finish({ ok: true, data: snapshot(first) }));
    expect((screen.getByLabelText('Grupo') as HTMLSelectElement).value).toBe(second.id);
    expect(mocks.replace).toHaveBeenLastCalledWith(`/comunidad/entre-nosotros?group=${second.id}`, { scroll: false });
  });
  it('removes all previous account evidence and does not accept its pending request', async () => {
    let finish!: (value: Result<Snapshot>) => void;
    mocks.load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const mounted = render(ui()); openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: first.id } });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1)); mounted.rerender(ui([], 'new'));
    await act(async () => finish({ ok: true, data: snapshot(first) }));
    expect(screen.queryByText('Tú')).toBeNull(); expect(screen.getByText('Compara con quien sigues')).toBeTruthy();
  });
  it.each(['SIGNED_OUT', 'SIGNED_IN', 'INITIAL_SESSION'])('invalidates evidence immediately on %s before the new SSR payload', async event => {
    mocks.query = `group=${first.id}`;
    let finish!: (value: Result<Snapshot>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const mounted = render(ui()); await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    act(() => mocks.auth!(event, event === 'SIGNED_OUT' ? null : { user: { id: 'another-account' } }));
    expect(screen.queryByLabelText('Grupo')).toBeNull(); expect(screen.getByText(messages.comparisons.sessionChanged)).toBeTruthy();
    await act(async () => finish({ ok: true, data: snapshot(first) })); expect(screen.queryByText('Tú')).toBeNull();
    mounted.unmount(); expect(mocks.unsubscribe).toHaveBeenCalled();
  });
  it('keeps evidence for repeated SIGNED_IN and token refresh of the same account', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('button', { name: 'Tú' });
    act(() => mocks.auth!('SIGNED_IN', { user: { id: 'a' } })); act(() => mocks.auth!('TOKEN_REFRESHED', { user: { id: 'a' } }));
    expect(screen.getByRole('button', { name: 'Tú' })).toBeTruthy(); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('starts a fresh subtree after the same account authenticates again on the server', async () => {
    mocks.query = `group=${first.id}`;
    const mounted = render(ui()); await screen.findByRole('button', { name: 'Tú' });
    // The session-held atlas lens survives reloads; only a fresh subtree resets it.
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    expect(screen.getByRole('button', { name: 'Opinión' }).getAttribute('aria-pressed')).toBe('true');
    openGroupSheet(); fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' }));
    fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador antiguo' } });
    act(() => mocks.auth!('SIGNED_OUT', null)); expect(screen.queryByLabelText('Grupo')).toBeNull();
    mounted.rerender(ui()); await screen.findByRole('button', { name: 'Tú' });
    expect(screen.getByRole('button', { name: 'Quién' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Opinión' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByLabelText('Nombre del grupo')).toBeNull();
  });
  it('updates saved group data and uses its new revision on the next edit', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('button', { name: 'Tú' });
    const saved: Group = { ...first, name: 'Ateneo', revision: 2, members: [first.members[0], { slotId: 'new-member', userId: 'b', name: 'Bea', avatarUrl: null, available: true }] };
    mocks.save.mockResolvedValue({ ok: true, data: saved }); mocks.load.mockResolvedValue({ ok: true, data: snapshot(saved) });
    openGroupSheet(); fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' }));
    fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: saved.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar persona no disponible' }));
    fireEvent.click(within(screen.getByRole('form')).getByRole('checkbox', { name: 'Bea' }));
    fireEvent.submit(screen.getByRole('form')); await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
    await screen.findByRole('heading', { name: saved.name });
    // A rename re-sorts the selector instead of moving the group to the end.
    openGroupSheet(); expect(within(screen.getByRole('combobox', { name: 'Grupo' })).getAllByRole('option').map(option => option.textContent)).toEqual(['Elige un grupo', 'Ateneo', 'Cine']);
    expect(mocks.save).toHaveBeenLastCalledWith({ id: first.id, name: saved.name, userIds: ['a', 'b'], expectedRevision: 1 });
    openGroupSheet(); fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith({ id: first.id, name: saved.name, userIds: ['a', 'b'], expectedRevision: 2 }));
  });
  it('keeps evidence, scroll extent and draft visible while unchanged session cookies are verified in the background', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('button', { name: 'Tú' });
    openGroupSheet(); fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador' } });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(mocks.getUser).toHaveBeenCalledOnce(); expect(screen.getByRole('form')).toBeTruthy();
    expect(screen.queryByText(messages.comparisons.checkingSession)).toBeNull();
    await act(async () => finish({ data: { user: { id: 'a' } }, error: null }));
    expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Borrador');
  });
  it('hides evidence synchronously when session cookies change even behind a quiet check in flight', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('button', { name: 'Tú' });
    let finishQuiet!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finishQuiet = resolve; }))
      .mockResolvedValueOnce({ data: { user: { id: 'b' } }, error: null });
    act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.getByRole('button', { name: /^Grupo: / })).toBeTruthy();
    rotateSessionCookies(); act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.queryByRole('button', { name: /^Grupo: / })).toBeNull(); expect(screen.getByText(messages.comparisons.checkingSession)).toBeTruthy();
    await act(async () => finishQuiet({ data: { user: { id: 'a' } }, error: null }));
    await screen.findByText(messages.comparisons.sessionChanged); expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });
  it('deduplicates focus and visibility identity checks, hides evidence meanwhile and preserves the same-account draft', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('button', { name: 'Tú' });
    openGroupSheet(); fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador' } });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    rotateSessionCookies(); act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(mocks.getUser).toHaveBeenCalledOnce(); expect(screen.queryByRole('form')).toBeNull(); expect(screen.getByText(messages.comparisons.checkingSession)).toBeTruthy();
    await act(async () => finish({ data: { user: { id: 'a' } }, error: null }));
    expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Borrador');
  });
  it('uses fresh identity on focus to catch cookie changes that emitted no browser auth event', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('button', { name: 'Tú' });
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'new-account' } }, error: null });
    act(() => window.dispatchEvent(new Event('focus'))); await screen.findByText(messages.comparisons.sessionChanged);
    expect(screen.queryByText('Tú')).toBeNull(); expect(screen.queryByLabelText('Grupo')).toBeNull();
  });
  it.each(['resolve', 'error', 'reject'])('discards an older %s completion and coalesces a fresh check without reopening A', async completion => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('button', { name: 'Tú' });
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
    expect(screen.queryByRole('button', { name: /^Grupo: / })).toBeNull();
    expect(screen.queryByText(messages.comparisons.sessionCheckFailed)).toBeNull();
    await act(async () => finishFresh({ data: { user: { id: 'b' } }, error: null }));
    expect(screen.getByText(messages.comparisons.sessionChanged)).toBeTruthy();
    expect(screen.queryByLabelText('Grupo')).toBeNull();
    act(() => window.dispatchEvent(new Event('focus'))); expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });
  it('keeps the same-account draft hidden until its queued fresh answer completes', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('button', { name: 'Tú' });
    openGroupSheet(); fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador' } });
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
    mocks.query = `group=${first.id}`; const mounted = render(ui()); await screen.findByRole('button', { name: 'Tú' });
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
    mocks.query = `group=${first.id}`; const mounted = render(ui()); await screen.findByRole('button', { name: 'Tú' });
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('offline') });
    act(() => window.dispatchEvent(new Event('focus'))); await screen.findByText(messages.comparisons.sessionCheckFailed);
    expect(screen.queryByRole('button', { name: /^Grupo: / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await screen.findByRole('button', { name: /^Grupo: / });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); act(() => window.dispatchEvent(new Event('focus')));
    mounted.unmount(); await act(async () => finish({ data: { user: { id: 'another' } }, error: null }));
    expect(mocks.refresh).not.toHaveBeenCalled();
    const before = mocks.getUser.mock.calls.length; act(() => window.dispatchEvent(new Event('focus'))); expect(mocks.getUser.mock.calls.length).toBe(before);
  });
  it('accepts a freshly authenticated server payload and ignores the previous identity check', async () => {
    mocks.query = `group=${first.id}`; const mounted = render(ui()); await screen.findByRole('button', { name: 'Tú' });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); rotateSessionCookies(); act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.queryByRole('button', { name: /^Grupo: / })).toBeNull(); mounted.rerender(ui());
    await screen.findByRole('button', { name: /^Grupo: / });
    await act(async () => finish({ data: { user: { id: 'old-check' } }, error: null }));
    expect(screen.queryByText(messages.comparisons.sessionChanged)).toBeNull(); expect(screen.getByRole('button', { name: /^Grupo: / })).toBeTruthy();
  });
  it('renders load conflict as reload and clears previous evidence while refreshing permissions', async () => {
    render(ui()); openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: first.id } }); await screen.findByText('Persona no disponible');
    mocks.load.mockResolvedValueOnce({ ok: false, code: 'conflict' });
    openGroupSheet(); fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(screen.queryByText('Persona no disponible')).toBeNull(); await screen.findByText(messages.comparisons.loadConflict);
    expect(screen.getByRole('button', { name: 'Recargar comparación' })).toBeTruthy(); expect(screen.queryByText('0 obras')).toBeNull();
  });
  it('shows read errors as errors and restores normal load on retry', async () => {
    mocks.load.mockResolvedValueOnce({ ok: false, code: 'load-failed' }); render(ui());
    openGroupSheet(); fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: first.id } }); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Recargar comparación' })); await screen.findByText('Persona no disponible');
  });
  it('ignores a forged group query and selects an owned valid UUID', async () => {
    mocks.query = 'group=cccccccc-cccc-cccc-cccc-cccccccccccc'; const mounted = render(ui()); expect(mocks.load).not.toHaveBeenCalled();
    mounted.unmount(); mocks.query = `group=${first.id}`; render(ui()); await screen.findByText('Persona no disponible'); expect(mocks.load).toHaveBeenCalledWith(first.id, 'all');
  });
  it('retries the load on a format change after a failed load', async () => {
    mocks.query = `group=${first.id}`; mocks.load.mockResolvedValueOnce({ ok: false, code: 'load-failed' }); render(ui());
    await screen.findByRole('button', { name: 'Recargar comparación' });
    const pills = screen.getByRole('group', { name: 'Filtrar por tipo de obra' });
    fireEvent.click(within(pills).getByRole('button', { name: 'Libros' }));
    await screen.findByRole('button', { name: 'Tú' }); expect(mocks.load.mock.calls).toEqual([[first.id, 'all'], [first.id, 'all']]);
    expect(within(pills).getByRole('button', { name: 'Libros' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('exposes format only through the visible pills, one pressed at a time', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByRole('button', { name: 'Tú' });
    // A second, hidden native control duplicated the pills for screen readers.
    expect(screen.queryByRole('combobox', { name: 'Formato' })).toBeNull();
    const pills = screen.getByRole('group', { name: 'Filtrar por tipo de obra' });
    fireEvent.click(within(pills).getByRole('button', { name: 'Películas' }));
    fireEvent.click(within(pills).getByRole('button', { name: 'Series' }));
    expect(within(pills).getByRole('button', { name: 'Series' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(pills).getByRole('button', { name: 'Películas' }).getAttribute('aria-pressed')).toBe('false');
    expect(mocks.load.mock.calls).toEqual([[first.id, 'all']]);
  });
});
