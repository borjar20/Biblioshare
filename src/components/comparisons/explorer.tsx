'use client';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { loadComparison } from '@/lib/comparisons/actions';
import { sortGroups } from '@/lib/comparisons/order';
import { withPersonId, withPersonTarget } from '@/lib/comparisons/with-person';
import type { Candidate, Format, Group, Result, Snapshot } from '@/lib/comparisons/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { GroupEditor } from './group-editor';
import { AtlasView } from './atlas/atlas-view';
import type { Lens } from '@/lib/comparisons/atlas/scene';
import type { IslandMode } from '@/lib/comparisons/atlas/islands';
import { atlasQuery, clearAtlasMemory, parseAtlasQuery, readGroupMemory, sessionStore, writeGroupMemory } from './atlas-ui-state';
import { GroupSheet } from './group-sheet';
import { ComparisonLoading } from './loading';
import { forFormat } from '@/lib/comparisons/derive';
import { acceptResponse, changeGroup, changeSelection, clearEvidence, deriveFormat, initialState, reconcileParticipants, reconcileView, selectOwnedGroup, setView } from './state';
import type { ExplorerState, Section, TasteControls, View } from './state';
import { presentViewer } from './presentation';
import styles from './explorer.module.css';

function Icon({ kind }: { kind: 'works' | 'lock' | 'edit' | 'plus' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'works' ? <><circle cx="9" cy="10" r="6"/><circle cx="15" cy="14" r="6"/></> : kind === 'lock' ? <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></> : kind === 'edit' ? <><path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></> : <path d="M12 5v14M5 12h14"/>}</svg>;
}

type Props = { initialGroups: Group[]; candidates: Candidate[]; viewerId: string };
/** The atlas UI the explorer keeps across format changes (which remount AtlasView). `faces` belong to `groupId`. */
type AtlasUi = { groupId: string | null; faces: string[] | null; lens: Lens; islandMode: IslandMode; list: boolean };
const rememberedFaces = (viewerId: string, groupId: string | null) => groupId ? readGroupMemory(sessionStore(), viewerId, groupId).faces : null;
/** `?con=` for the unsaved pair, `?group=` for a saved group, plus the lens and Islas mode when not the default. */
function atlasHref(groupId: string | null, lens: Lens, mode: IslandMode) {
  const person = groupId && withPersonTarget(groupId);
  const query = atlasQuery(new URLSearchParams(person ? { con: person } : groupId ? { group: groupId } : {}), lens, mode);
  return `/comunidad/entre-nosotros${query ? `?${query}` : ''}`;
}
type Action = { type: 'group'; id: string | null } | { type: 'section'; section: Section }
  | { type: 'format'; format: Format } | { type: 'refresh' }
  | { type: 'loading'; seq: number } | { type: 'response'; seq: number; result: Result<Snapshot> }
  | { type: 'view'; view: View } | { type: 'selection'; people: string[] } | { type: 'tasteControls'; controls: TasteControls };
export function explorerReducer(state: ExplorerState, action: Action): ExplorerState {
  switch (action.type) {
    case 'tasteControls': return { ...state, tasteControls: action.controls };
    case 'group': return changeGroup(state, action.id);
    case 'section': {
      const sameFormat = state.formats[state.section] === state.formats[action.section];
      if (!sameFormat && state.source) {
        const derived = deriveFormat({ ...state, section: action.section }); const view = derived.views[action.section];
        return { ...derived, selection: view.level === 'group' ? derived.selection : [...view.people] };
      }
      // A load in flight serves every format; dropping it would leave nothing to show.
      const next = sameFormat || state.snapshot.status === 'loading' ? state : clearEvidence(state);
      const view = sameFormat && next.snapshot.value ? reconcileView(next.views[action.section], next.snapshot.value) : next.views[action.section];
      return { ...next, section: action.section, views: { ...next.views, [action.section]: view },
        selection: view.level === 'group' ? next.selection : [...view.people] };
    }
    case 'format': {
      const formats = { ...state.formats, [state.section]: action.format };
      if (state.source) return deriveFormat({ ...state, formats });
      return state.snapshot.status === 'loading' ? { ...state, formats } : { ...clearEvidence(state), formats };
    }
    case 'refresh': return { ...clearEvidence(state), source: null };
    case 'selection': return changeSelection(state, action.people);
    case 'view': return setView(state, state.section, action.view);
    case 'loading': return { ...clearEvidence(state), source: null, snapshot: { seq: action.seq, value: null, status: 'loading' } };
    case 'response': {
      // The request is always `all`; the section's format is derived when it arrives.
      const source = action.result.ok ? action.result.data : null;
      const result: Result<Snapshot> = source ? { ok: true, data: forFormat(source, state.formats[state.section]) } : action.result;
      const snapshot = acceptResponse(state.snapshot, action.seq, result);
      if (snapshot === state.snapshot) return state;
      return { ...state, source, revealSeq: snapshot.seq, snapshot, loadError: action.result.ok ? null : action.result.code, views: snapshot.value ? {
        works: reconcileParticipants(state.views.works, snapshot.value.group),
        tastes: reconcileParticipants(state.views.tastes, snapshot.value.group),
        [state.section]: reconcileView(state.views[state.section], snapshot.value),
      } : state.views, selection: snapshot.value ? state.selection.filter(id => snapshot.value!.group.members.some(member => member.available && member.userId === id)) : state.selection };
    }
  }
}
/** Supabase session cookies, read synchronously. Unchanged tokens cannot belong to another account. */
export function sessionCookies(): string {
  if (typeof document === 'undefined') return '';
  return document.cookie.split(';').map(part => part.trim()).filter(part => /^sb-[^=]*-auth-token(?:\.\d+)?=/.test(part)).sort().join(';');
}
// A fresh account gets a fresh subtree synchronously, including drafts and pending responses.
export function Explorer(props: Props) { return <SessionBoundary key={props.viewerId} {...props}/>; }
function SessionBoundary(props: Props) {
  const t = useTranslations('comparisons'); const router = useRouter();
  const [blockedGroups, setBlockedGroups] = useState<Group[] | null>(null);
  const [verification, setVerification] = useState<'valid' | 'checking' | 'failed'>('valid');
  const [serverGroups, setServerGroups] = useState(props.initialGroups);
  const verifySession = useRef<(() => void) | null>(null);
  if (serverGroups !== props.initialGroups) {
    setServerGroups(props.initialGroups); setBlockedGroups(null); setVerification('valid');
  }
  useEffect(() => {
    let invalidated = false; let disposed = false; let checking = false; let queued = false; let checkSeq = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    // Cookies last confirmed for this viewer. Same cookies: verify without hiding evidence.
    let verifiedCookies = sessionCookies();
    const client = createClient();
    function invalidate() {
      if (invalidated || disposed) return;
      checkSeq += 1;
      invalidated = true; setBlockedGroups(props.initialGroups);
      // Faces and cameras are this account's: none survives into the next one on this tab.
      clearAtlasMemory(sessionStore());
      // Keep the auth callback synchronous; refresh outside the auth event stack.
      refreshTimer = setTimeout(() => router.refresh(), 0);
    }
    function verify() {
      if (invalidated || disposed) return;
      const cookies = sessionCookies();
      // Changed cookies may be another account: hide before the network answers.
      if (cookies !== verifiedCookies) setVerification('checking');
      if (checking) { queued = true; checkSeq += 1; return; }
      checking = true; const seq = ++checkSeq;
      void client.auth.getUser().then(({ data, error }) => {
        if (disposed || invalidated) return;
        checking = false;
        if (queued) { queued = false; verify(); return; }
        if (seq !== checkSeq) return;
        if (error) setVerification('failed');
        else if (data.user?.id !== props.viewerId) invalidate();
        else if (sessionCookies() !== cookies) verify();
        else { verifiedCookies = cookies; setVerification('valid'); }
      }).catch(() => {
        if (disposed || invalidated) return;
        checking = false;
        if (queued) { queued = false; verify(); return; }
        if (seq === checkSeq) setVerification('failed');
      });
    }
    const onVisible = () => { if (document.visibilityState === 'visible') verify(); };
    verifySession.current = verify;
    window.addEventListener('focus', verify); document.addEventListener('visibilitychange', onVisible);
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || session?.user.id !== props.viewerId) invalidate();
      // Own token refreshes rewrite the cookies for the same viewer.
      else if (event === 'TOKEN_REFRESHED') verifiedCookies = sessionCookies();
    });
    return () => { disposed = true; checkSeq += 1; verifySession.current = null; subscription.unsubscribe(); clearTimeout(refreshTimer); window.removeEventListener('focus', verify); document.removeEventListener('visibilitychange', onVisible); };
  }, [props.viewerId, props.initialGroups, router]);
  // A new server payload has authenticated again. Its account subtree starts from scratch.
  return blockedGroups === props.initialGroups ? <p role="status">{t('sessionChanged')}</p> : <>
    {verification === 'checking' && <p role="status">{t('checkingSession')}</p>}
    {verification === 'failed' && <div role="alert"><p>{t('sessionCheckFailed')}</p><Button onClick={() => verifySession.current?.()}>{t('retry')}</Button></div>}
    <div hidden={verification !== 'valid'} inert={verification !== 'valid'}><ExplorerSession {...props}/></div>
  </>;
}
function ExplorerSession({ initialGroups, candidates, viewerId }: Props) {
  const t = useTranslations('comparisons'); const router = useRouter(); const search = useSearchParams();
  const [groups, setGroups] = useState(initialGroups);
  // Unsaved pair opened from a profile (#1484): only an accepted, visible follow is a candidate.
  const conQuery = search.get('con');
  const withPerson = candidates.find(person => person.userId === conQuery && person.userId !== viewerId) ?? null;
  const self = candidates.find(person => person.userId === viewerId);
  const withName = withPerson ? t('withName', { name: withPerson.name }) : '';
  const withGroup = useMemo<Group | null>(() => withPerson && { id: withPersonId(withPerson.userId), name: withName, revision: 1, members: [
    { slotId: 'self', userId: viewerId, name: self?.name ?? null, avatarUrl: self?.avatarUrl ?? null, available: true },
    { slotId: 'with', userId: withPerson.userId, name: withPerson.name, avatarUrl: withPerson.avatarUrl, available: true }] }, [withPerson, withName, self, viewerId]);
  const choices = withGroup ? [withGroup, ...groups] : groups;
  const [state, dispatch] = useReducer(explorerReducer, viewerId, id => ({ ...initialState(id), groupId: withGroup?.id ?? selectOwnedGroup(search.get('group'), initialGroups) }));
  const [editor, setEditor] = useState<{ group: Group | null; people?: string[] } | null>(null);
  const [reload, forceReload] = useReducer((value: number) => value + 1, 0);
  const [completedHandoff, setCompletedHandoff] = useState<number | null>(null);
  // Atlas UI state lives here, not in AtlasView: a format change remounts the view. The lens and the Islas mode come from
  // (and go to) the URL; the faces are remembered per group in sessionStorage (no person ids in the URL). A group without
  // memory starts with everyone.
  const [atlasUi, setAtlasUi] = useState<AtlasUi>(() => ({ groupId: state.groupId, faces: rememberedFaces(viewerId, state.groupId), ...parseAtlasQuery(search), list: false }));
  if (atlasUi.groupId !== state.groupId) setAtlasUi(current => ({ ...current, groupId: state.groupId, faces: rememberedFaces(viewerId, state.groupId) }));
  const chosenFaces = atlasUi.groupId === state.groupId ? atlasUi.faces : null;
  const sequence = useRef(0); const initialSignature = useRef(JSON.stringify(initialGroups));
  const groupChip = useRef<HTMLButtonElement>(null);
  const groupQuery = withGroup?.id ?? search.get('group');
  const observedQuery = useRef(groupQuery);
  const active = choices.find(group => group.id === state.groupId) ?? null;
  const activeIsUnsaved = !!active && active.id === withGroup?.id;
  const you = t('you');
  const loaded = state.snapshot.value;
  const snapshot = useMemo(() => loaded && presentViewer(loaded, viewerId, you), [loaded, viewerId, you]);
  const format = state.formats[state.section];
  useEffect(() => {
    if (observedQuery.current === groupQuery) return;
    observedQuery.current = groupQuery;
    const next = selectOwnedGroup(groupQuery, withGroup ? [withGroup, ...groups] : groups);
    if (next !== state.groupId) dispatch({ type: 'group', id: next });
  }, [groupQuery, groups, withGroup, state.groupId]);
  useEffect(() => {
    const signature = JSON.stringify(initialGroups);
    if (signature === initialSignature.current) return;
    sequence.current += 1;
    initialSignature.current = signature;
    setGroups(initialGroups);
    // The unsaved pair is not a saved group: a groups refresh keeps it.
    if (state.groupId && withPersonTarget(state.groupId) === null && !initialGroups.some(group => group.id === state.groupId)) dispatch({ type: 'group', id: null });
    else dispatch({ type: 'refresh' });
    forceReload();
  }, [initialGroups, state.groupId]);
  useEffect(() => {
    if (!state.groupId) return;
    const seq = ++sequence.current; const id = state.groupId;
    dispatch({ type: 'loading', seq });
    // One `all` load per group revision; switching format derives from it (#1481).
    void loadComparison(id, 'all').catch((): Result<Snapshot> => ({ ok: false, code: 'load-failed' })).then(result => {
      if (sequence.current !== seq) return;
      dispatch({ type: 'response', seq, result });
      if (result.ok) setGroups(current => sortGroups(current.map(group => group.id === id ? result.data.group : group)));
    });
    return () => { sequence.current += 1; };
  }, [state.groupId, reload]);
  function selectGroup(id: string | null) {
    sequence.current += 1; dispatch({ type: 'group', id }); setEditor(null);
    groupChip.current?.focus();
    router.replace(atlasHref(id, atlasUi.lens, atlasUi.islandMode), { scroll: false });
  }
  function setAtlasLens(lens: Lens) {
    setAtlasUi(current => ({ ...current, lens }));
    router.replace(atlasHref(state.groupId, lens, atlasUi.islandMode), { scroll: false });
  }
  function setAtlasIslandMode(islandMode: IslandMode) {
    setAtlasUi(current => ({ ...current, islandMode }));
    router.replace(atlasHref(state.groupId, atlasUi.lens, islandMode), { scroll: false });
  }
  function setAtlasFaces(faces: string[]) {
    const id = state.groupId; if (!id) return;
    setAtlasUi(current => ({ ...current, groupId: id, faces }));
    writeGroupMemory(sessionStore(), viewerId, id, { faces });
  }
  function refresh() { sequence.current += 1; dispatch({ type: 'refresh' }); forceReload(); }
  function onSaved(group: Group) {
    setGroups(current => sortGroups([...current.filter(item => item.id !== group.id), group])); selectGroup(group.id);
    // Even a same-group save invalidates the old revision and permissions.
    forceReload();
  }
  // Without a loaded source (after an error) a format change retries the load, as before.
  const retryWithoutSource = () => { if (state.groupId && !state.source && state.snapshot.status !== 'loading') forceReload(); };
  function setFormat(next: Format) { dispatch({ type: 'format', format: next }); if (next !== format) retryWithoutSource(); }
  return <div className={`dark ${styles.immersive}`}>
    <header className={styles.bar}>
      <Link href="/comunidad" className={styles.back} aria-label={t('backToCommunity')}><span aria-hidden="true">←</span><span className={styles.backLabel} aria-hidden="true">{t('backToCommunity')}</span></Link>
      <h1>{t('title')}</h1>
      <GroupSheet chipRef={groupChip} choices={choices} value={state.groupId} unsavedId={withGroup?.id ?? null} activeName={active?.name ?? null}
        canEdit={!!active && !activeIsUnsaved} canSaveUnsaved={activeIsUnsaved && !!withGroup} showRefresh={!!active}
        onSelect={id => selectGroup(selectOwnedGroup(id, choices))} onEdit={() => active && setEditor({ group: active })}
        onCreate={() => setEditor({ group: null })}
        onSaveUnsaved={() => withGroup && setEditor({ group: null, people: withGroup.members.flatMap(member => member.userId ? [member.userId] : []) })}
        onRefresh={refresh}/>
      <span className={styles.barSpacer}/>
      {active && <div className={styles.barNav}>
        <div className={styles.formats} role="group" aria-label={t('formatPills')}>{(['all', 'book', 'movie', 'series'] as const).map(next => <button key={next} type="button" aria-pressed={format === next} onClick={() => setFormat(next)}>{t(next === 'all' ? 'allFormatsShort' : `formats.${next}`)}</button>)}</div>
      </div>}
    </header>
    {editor && <GroupEditor key={editor.group?.id ?? 'new'} group={editor.group} initialPeople={editor.people} candidates={candidates} viewerId={viewerId} onSaved={onSaved} onDeleted={id => { setGroups(current => current.filter(group => group.id !== id)); selectGroup(null); }} onCancel={() => { setEditor(null); groupChip.current?.focus(); }} onReload={() => { setEditor(null); groupChip.current?.focus(); refresh(); router.refresh(); }}/>}
    {!choices.length && !editor && <div className={styles.immersiveEmpty}>{candidates.some(person => person.userId !== viewerId)
      ? <EmptyState variant="panel" glyph={<Icon kind="works"/>} title={t('noGroups')} message={t('noGroupsMessage')} action={<Button onClick={() => setEditor({ group: null })}>{t('createFirstGroup')}</Button>}/>
      : <EmptyState variant="panel" glyph={<Icon kind="works"/>} title={t('noFollowsTitle')} message={t('noFollowsMessage')} action={<Link href="/comunidad?tab=personas" className={buttonVariants('primary')}>{t('findPeopleToFollow')}</Link>}/>}</div>}
    {active && <section aria-label={t('canvas')} aria-busy={state.snapshot.status === 'loading'} className={styles.stage}>
      <h2 className={styles.srOnly}>{active.name}</h2>
      {state.snapshot.status === 'loading' && <div className={styles.workspaceLoading}><ComparisonLoading label={t('loading')}/></div>}
      {state.snapshot.status === 'error' && <div role="alert"><p>{t(state.loadError === 'conflict' ? 'loadConflict' : `errors.${state.loadError ?? 'load-failed'}`)}</p><Button variant="secondary" onClick={() => { refresh(); if (state.loadError === 'unavailable' || state.loadError === 'unauthenticated') router.refresh(); }}>{t('reloadComparison')}</Button></div>}
      {snapshot && <div key={state.snapshot.seq} className={styles.canvasWrap} data-comparison-reveal data-comparison-slot={state.section} data-view={state.views[state.section].level}>
        <AtlasView snapshot={snapshot} viewerId={viewerId} groupId={state.groupId!} chosen={chosenFaces} lens={atlasUi.lens} onLensChange={setAtlasLens} islandMode={atlasUi.islandMode} onIslandModeChange={setAtlasIslandMode} list={atlasUi.list} onListChange={list => setAtlasUi(current => ({ ...current, list }))} onChosenChange={setAtlasFaces} notice={snapshot.excludedSeriesWithoutEpisodes > 0 ? <p className={styles.coverageNote} data-comparison-coverage>{t('excludedHistoricalSeries', { count: snapshot.excludedSeriesWithoutEpisodes })}</p> : null}/>
      </div>}
      {snapshot && state.revealSeq === state.snapshot.seq && completedHandoff !== state.snapshot.seq && <div key={`handoff-${state.snapshot.seq}`} aria-hidden="true" inert className={`${styles.workspaceLoading} ${styles.loadingExit}`} data-comparison-handoff onAnimationEnd={event => {
        if (event.target === event.currentTarget) setCompletedHandoff(state.snapshot.seq);
      }}><ComparisonLoading label={t('loading')}/></div>}
    </section>}
  </div>;
}
