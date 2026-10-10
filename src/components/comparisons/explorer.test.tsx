// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../messages/es.json';
import type { Group, Result, Snapshot } from '@/lib/comparisons/types';
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn(), replace: vi.fn(), refresh: vi.fn(), unsubscribe: vi.fn(), getUser: vi.fn(), auth: null as ((event: string, session: { user: { id: string } } | null) => void) | null, query: '' }));
const mockRouter = { replace: mocks.replace, refresh: mocks.refresh };
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: mocks.getUser, onAuthStateChange: (callback: typeof mocks.auth) => { mocks.auth = callback; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }; } } }) }));
vi.mock('@/lib/comparisons/actions', () => ({ loadComparison: mocks.load, saveGroup: mocks.save, deleteGroup: mocks.remove }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter, useSearchParams: () => new URLSearchParams(mocks.query) }));
import { Explorer } from './explorer';
const group = (suffix: string, name: string): Group => ({ id: `${suffix.repeat(8)}-${suffix.repeat(4)}-${suffix.repeat(4)}-${suffix.repeat(4)}-${suffix.repeat(12)}`, name, revision: 1, members: [{ slotId: 'one', userId: 'a', name: 'Ana', avatarUrl: null, available: true }, { slotId: 'two', userId: null, name: null, avatarUrl: null, available: false }] });
const first = group('a', 'Lectores'); const second = group('b', 'Cine');
const snapshot = (g: Group): Snapshot => ({ group: g, format: 'all', catalog: [], works: [], excludedSeriesWithoutEpisodes: 0 });
function ui(groups = [first, second], viewerId = 'a') { return <NextIntlClientProvider locale="es" messages={messages}><Explorer initialGroups={groups} candidates={[{ userId: 'a', name: 'Ana', avatarUrl: null }, { userId: 'b', name: 'Bea', avatarUrl: null }]} viewerId={viewerId}/></NextIntlClientProvider>; }
beforeEach(() => { vi.clearAllMocks(); mocks.query = ''; mocks.load.mockResolvedValue({ ok: true, data: snapshot(first) }); mocks.getUser.mockResolvedValue({ data: { user: { id: 'a' } }, error: null }); });
afterEach(cleanup);
describe('Explorer request boundaries', () => {
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
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByText('Ana');
    act(() => mocks.auth!('SIGNED_IN', { user: { id: 'a' } })); act(() => mocks.auth!('TOKEN_REFRESHED', { user: { id: 'a' } }));
    expect(screen.getByText('Ana')).toBeTruthy(); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('starts a fresh subtree after the same account authenticates again on the server', async () => {
    mocks.query = `group=${first.id}`;
    const mounted = render(ui()); await screen.findByText('Ana');
    fireEvent.click(screen.getByLabelText('Ana')); fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' }));
    fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador antiguo' } });
    act(() => mocks.auth!('SIGNED_OUT', null)); expect(screen.queryByLabelText('Grupo')).toBeNull();
    mounted.rerender(ui()); await screen.findByText('Ana');
    expect((screen.getByLabelText('Ana') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText('Nombre del grupo')).toBeNull();
  });
  it('updates saved group data and uses its new revision on the next edit', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByText('Ana');
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
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' })); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Borrador' } });
    let finish!: (result: { data: { user: { id: string } }; error: null }) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(mocks.getUser).toHaveBeenCalledOnce(); expect(screen.queryByRole('form')).toBeNull(); expect(screen.getByText(messages.comparisons.checkingSession)).toBeTruthy();
    await act(async () => finish({ data: { user: { id: 'a' } }, error: null }));
    expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Borrador');
  });
  it('uses fresh identity on focus to catch cookie changes that emitted no browser auth event', async () => {
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByText('Ana');
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'new-account' } }, error: null });
    act(() => window.dispatchEvent(new Event('focus'))); await screen.findByText(messages.comparisons.sessionChanged);
    expect(screen.queryByText('Ana')).toBeNull(); expect(screen.queryByLabelText('Grupo')).toBeNull();
  });
  it('keeps a failed identity check gated until successful retry and discards stale checks on unmount', async () => {
    mocks.query = `group=${first.id}`; const mounted = render(ui()); await screen.findByText('Ana');
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
    mocks.query = `group=${first.id}`; const mounted = render(ui()); await screen.findByText('Ana');
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
    mocks.query = `group=${first.id}`; render(ui()); await screen.findByText('Ana');
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
