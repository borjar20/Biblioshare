import { facets, regions } from '@/lib/comparisons/derive';
import type { FacetKind, Format, Group, Result, Snapshot, WorkDetail, WorkKey } from '@/lib/comparisons/types';

export type WorkOrigin = { kind: 'region'; mask: number } | { kind: 'facet'; facetKind: FacetKind; facetId: string };
export type View = { level: 'group' } | { level: 'venn'; people: string[] }
  | { level: 'region'; people: string[]; mask: number }
  | { level: 'facet'; people: string[]; facetKind: FacetKind; facetId: string }
  | { level: 'work'; people: string[]; origin: WorkOrigin; key: WorkKey };
export type Section = 'works' | 'tastes';
export type RequestState<T> = { seq: number; value: T | null; status: 'idle' | 'loading' | 'ready' | 'error' };
export function acceptResponse<T>(state: RequestState<T>, seq: number, result: Result<T>): RequestState<T> {
  if (state.seq !== seq) return state;
  return result.ok ? { seq, value: result.data, status: 'ready' } : { seq, value: null, status: 'error' };
}
export type ExplorerState = { viewerId: string; groupId: string | null; section: Section; formats: Record<Section, Format>;
  selection: string[]; views: Record<Section, View>; snapshot: RequestState<Snapshot>; detail: RequestState<WorkDetail>;
  loadError: Extract<Result<never>, { ok: false }>['code'] | null };
export function initialState(viewerId: string): ExplorerState {
  return { viewerId, groupId: null, section: 'works', formats: { works: 'all', tastes: 'all' }, selection: [], loadError: null,
    views: { works: { level: 'group' }, tastes: { level: 'group' } },
    snapshot: { seq: 0, value: null, status: 'idle' }, detail: { seq: 0, value: null, status: 'idle' } };
}
export function changeAccount(state: ExplorerState, viewerId: string): ExplorerState {
  if (state.viewerId === viewerId) return state;
  return { ...initialState(viewerId), snapshot: { seq: state.snapshot.seq + 1, value: null, status: 'idle' },
    detail: { seq: state.detail.seq + 1, value: null, status: 'idle' } };
}
export function clearEvidence(state: ExplorerState): ExplorerState {
  return { ...state, loadError: null, snapshot: { seq: state.snapshot.seq + 1, value: null, status: 'idle' },
    detail: { seq: state.detail.seq + 1, value: null, status: 'idle' } };
}
export function changeGroup(state: ExplorerState, groupId: string | null): ExplorerState {
  return { ...clearEvidence(state), groupId, selection: [], views: { works: { level: 'group' }, tastes: { level: 'group' } } };
}
export function setView(state: ExplorerState, section: Section, view: View): ExplorerState {
  return { ...state, views: { ...state.views, [section]: view }, detail: { seq: state.detail.seq + 1, value: null, status: 'idle' } };
}
export function changeSelection(state: ExplorerState, people: string[]): ExplorerState {
  const view = state.views[state.section];
  let next: View = { level: 'group' };
  if (state.snapshot.value && people.length >= 2 && people.length <= (state.section === 'works' ? 3 : 10) && view.level !== 'group') {
    next = view.level === 'venn' || view.level === 'region' || (view.level === 'work' && view.origin.kind === 'region')
      ? { level: 'venn', people } : { ...view, people };
    next = reconcileView(next, state.snapshot.value);
  }
  return { ...setView(state, state.section, next), selection: people };
}
export function selectOwnedGroup(value: unknown, groups: Group[]): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
    && groups.some(group => group.id === value) ? value : null;
}
/** Group membership is independent of the snapshot's media filter. */
export function reconcileParticipants(view: View, group: Group): View {
  if (view.level === 'group') return view;
  const available = new Set(group.members.filter(member => member.available && member.userId !== null).map(member => member.userId));
  if (view.people.length < 2 || view.people.length > 10 || new Set(view.people).size !== view.people.length || view.people.some(id => !available.has(id))) return { level: 'group' };
  return view;
}
/** Retain evidence context only against the format loaded for this section. */
export function reconcileView(view: View, snapshot: Snapshot): View {
  const valid = reconcileParticipants(view, snapshot.group);
  if (valid.level === 'group' || view.level === 'group') return valid;
  const facet = (kind: FacetKind, id: string) => facets(snapshot, view.people, kind).find(item => item.id === id);
  if (view.level === 'facet') return facet(view.facetKind, view.facetId) ? view : { level: 'group' };
  if (view.level === 'work' && view.origin.kind === 'facet') {
    const origin = view.origin;
    const category = facet(origin.facetKind, origin.facetId);
    if (!category) return { level: 'group' };
    return category.people.some(person => person.consumed.includes(view.key)) ? view
      : { level: 'facet', people: view.people, facetKind: origin.facetKind, facetId: origin.facetId };
  }
  if (view.people.length > 3) return { level: 'group' };
  if (view.level === 'work') {
    const origin = view.origin as Extract<WorkOrigin, { kind: 'region' }>;
    return regions(snapshot, view.people).some(region => region.mask === origin.mask && region.keys.includes(view.key)) ? view : { level: 'venn', people: view.people };
  }
  if (view.level === 'region' && (view.mask < 1 || view.mask >= 1 << view.people.length)) return { level: 'venn', people: view.people };
  return view;
}
