import { forFormat } from '@/lib/comparisons/derive';
import { withPersonTarget } from '@/lib/comparisons/with-person';
import type { Format, Group, Result, Snapshot } from '@/lib/comparisons/types';

export type RequestState<T> = { seq: number; value: T | null; status: 'idle' | 'loading' | 'ready' | 'error' };
export function acceptResponse<T>(state: RequestState<T>, seq: number, result: Result<T>): RequestState<T> {
  if (state.seq !== seq) return state;
  return result.ok ? { seq, value: result.data, status: 'ready' } : { seq, value: null, status: 'error' };
}
export type ExplorerState = { viewerId: string; groupId: string | null; format: Format; snapshot: RequestState<Snapshot>;
  loadError: Extract<Result<never>, { ok: false }>['code'] | null;
  /** The loaded all-format snapshot; every format of this load derives from it without a request. */
  source: Snapshot | null;
  /** Snapshot seq that came from the network; only those play the loader hand-off. */
  revealSeq: number };
export function initialState(viewerId: string): ExplorerState {
  return { viewerId, groupId: null, format: 'all', loadError: null, source: null, revealSeq: 0,
    snapshot: { seq: 0, value: null, status: 'idle' } };
}
export function changeAccount(state: ExplorerState, viewerId: string): ExplorerState {
  if (state.viewerId === viewerId) return state;
  return { ...initialState(viewerId), snapshot: { seq: state.snapshot.seq + 1, value: null, status: 'idle' } };
}
export function clearEvidence(state: ExplorerState): ExplorerState {
  return { ...state, loadError: null, snapshot: { seq: state.snapshot.seq + 1, value: null, status: 'idle' } };
}
export function changeGroup(state: ExplorerState, groupId: string | null): ExplorerState {
  return { ...clearEvidence(state), source: null, groupId };
}
export function selectOwnedGroup(value: unknown, groups: Group[]): string | null {
  return typeof value === 'string' && (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) || withPersonTarget(value) !== null)
    && groups.some(group => group.id === value) ? value : null;
}
/** Show the chosen format from the loaded source: a new ready snapshot, no request. */
export function deriveFormat(state: ExplorerState): ExplorerState {
  if (!state.source) return state;
  return { ...state, loadError: null, snapshot: { seq: state.snapshot.seq + 1, value: forFormat(state.source, state.format), status: 'ready' } };
}
