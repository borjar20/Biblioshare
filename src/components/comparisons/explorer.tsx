'use client';
import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { loadComparison } from '@/lib/comparisons/actions';
import { sortGroups } from '@/lib/comparisons/order';
import type { Candidate, Format, Group, Result, Snapshot } from '@/lib/comparisons/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { GroupEditor } from './group-editor';
import { ComparisonCanvas } from './canvas';
import { Tastes } from './tastes';
import { ComparisonLoading } from './loading';
import { forFormat } from '@/lib/comparisons/derive';
import { acceptResponse, changeGroup, changeSelection, clearEvidence, deriveFormat, initialState, reconcileParticipants, reconcileView, selectOwnedGroup, setView } from './state';
import type { ExplorerState, Section, TasteControls, View } from './state';
import { personColor } from './presentation';
import styles from './explorer.module.css';

function Icon({ kind }: { kind: 'works' | 'tastes' | 'lock' | 'edit' | 'plus' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'works' ? <><circle cx="9" cy="10" r="6"/><circle cx="15" cy="14" r="6"/></> : kind === 'tastes' ? <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"/><path d="M20 2v4m-2-2h4"/></> : kind === 'lock' ? <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></> : kind === 'edit' ? <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--surface)"/><circle cx="16" cy="12" r="2" fill="var(--surface)"/><circle cx="8" cy="18" r="2" fill="var(--surface)"/></> : <path d="M12 5v14M5 12h14"/>}</svg>;
}

type Props = { initialGroups: Group[]; candidates: Candidate[]; viewerId: string };
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
  const [state, dispatch] = useReducer(explorerReducer, viewerId, id => ({ ...initialState(id), groupId: selectOwnedGroup(search.get('group'), initialGroups) }));
  const [editor, setEditor] = useState<{ group: Group | null } | null>(null);
  const [reload, forceReload] = useReducer((value: number) => value + 1, 0);
  const [completedHandoff, setCompletedHandoff] = useState<number | null>(null);
  const sequence = useRef(0); const initialSignature = useRef(JSON.stringify(initialGroups));
  const groupSelector = useRef<HTMLSelectElement>(null);
  const observedQuery = useRef(search.get('group'));
  const active = groups.find(group => group.id === state.groupId) ?? null;
  const snapshot = state.snapshot.value;
  const format = state.formats[state.section];
  const groupQuery = search.get('group');
  useEffect(() => {
    if (observedQuery.current === groupQuery) return;
    observedQuery.current = groupQuery;
    const next = selectOwnedGroup(groupQuery, groups);
    if (next !== state.groupId) dispatch({ type: 'group', id: next });
  }, [groupQuery, groups, state.groupId]);
  useEffect(() => {
    const signature = JSON.stringify(initialGroups);
    if (signature === initialSignature.current) return;
    sequence.current += 1;
    initialSignature.current = signature;
    setGroups(initialGroups);
    if (state.groupId && !initialGroups.some(group => group.id === state.groupId)) dispatch({ type: 'group', id: null });
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
    groupSelector.current?.focus();
    router.replace(`/comunidad/entre-nosotros${id ? `?group=${id}` : ''}`, { scroll: false });
  }
  function refresh() { sequence.current += 1; dispatch({ type: 'refresh' }); forceReload(); }
  function onSaved(group: Group) {
    setGroups(current => sortGroups([...current.filter(item => item.id !== group.id), group])); selectGroup(group.id);
    // Even a same-group save invalidates the old revision and permissions.
    forceReload();
  }
  function togglePerson(userId: string) {
    dispatch({ type: 'selection', people: state.selection.includes(userId) ? state.selection.filter(id => id !== userId) : [...state.selection, userId] });
  }
  // Without a loaded source (after an error) a format or section change retries the load, as before.
  const retryWithoutSource = () => { if (state.groupId && !state.source && state.snapshot.status !== 'loading') forceReload(); };
  function setFormat(next: Format) { dispatch({ type: 'format', format: next }); if (next !== format) retryWithoutSource(); }
  function selectSection(section: Section) {
    dispatch({ type: 'section', section });
    if (state.formats[section] !== format) retryWithoutSource();
  }
  const workspaceControls = snapshot && <>
    <div className={styles.workspaceControls}>
      <h2 className={styles.srOnly}>{snapshot.group.name}</h2>
      {(state.section === 'tastes' || state.views.works.level !== 'group') && <fieldset className={styles.people}><legend className={styles.srOnly}>{t(state.section === 'works' ? 'selectPair' : 'selectTastes')}</legend>{snapshot.group.members.map(member => member.available && member.userId ? <label key={member.slotId} className={styles.personChip} data-selected={state.selection.includes(member.userId)} style={{ '--person': personColor(snapshot, member.userId) } as CSSProperties}><input type="checkbox" checked={state.selection.includes(member.userId)} onChange={() => togglePerson(member.userId!)}/><span className={styles.personDot} aria-hidden="true"/>{member.name}</label> : <span key={member.slotId} className={styles.unavailable}>{t('unavailablePerson')}</span>)}</fieldset>}
      <Button variant="ghost" onClick={refresh}>{t('refreshAccess')}</Button>
    </div>
    {snapshot.excludedSeriesWithoutEpisodes > 0 && <p className="py-3 text-sm text-muted-foreground" data-comparison-coverage>{t('excludedHistoricalSeries', { count: snapshot.excludedSeriesWithoutEpisodes })}</p>}
  </>;
  return <div className={styles.explorer}>
    <header className={styles.heading}>
      <div><h1 className={styles.title}>{t('title')}.</h1><p className={styles.intro}>{t('introShared')}<br/>{t('introDifferent')}</p></div>
      <div className={styles.groupControls}>
      <div className={styles.groupPicker}><span className={styles.private}><Icon kind="lock"/>{t('privateSelection')}</span>
      <label><span className={styles.srOnly}>{t('group')}</span><select ref={groupSelector} className={styles.groupSelect} value={state.groupId ?? ''} onChange={event => selectGroup(selectOwnedGroup(event.target.value, groups))}>
        <option value="">{t('chooseGroup')}</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select></label></div>
      {active && <button type="button" className={styles.iconButton} aria-label={t('editGroup')} title={t('editGroup')} onClick={() => setEditor({ group: active })}><Icon kind="edit"/></button>}
      <button type="button" className={styles.iconButton} aria-label={t('createGroup')} title={t('createGroup')} onClick={() => setEditor({ group: null })}><Icon kind="plus"/></button>
      </div>
    </header>
    {editor && <GroupEditor key={editor.group?.id ?? 'new'} group={editor.group} candidates={candidates} viewerId={viewerId} onSaved={onSaved} onDeleted={id => { setGroups(current => current.filter(group => group.id !== id)); selectGroup(null); }} onCancel={() => { setEditor(null); groupSelector.current?.focus(); }} onReload={() => { setEditor(null); groupSelector.current?.focus(); refresh(); router.refresh(); }}/>}
    {!groups.length && !editor && (candidates.some(person => person.userId !== viewerId)
      ? <EmptyState variant="panel" glyph={<Icon kind="works"/>} title={t('noGroups')} message={t('noGroupsMessage')} action={<Button onClick={() => setEditor({ group: null })}>{t('createFirstGroup')}</Button>}/>
      : <EmptyState variant="panel" glyph={<Icon kind="works"/>} title={t('noFollowsTitle')} message={t('noFollowsMessage')} action={<Link href="/comunidad?tab=personas" className={buttonVariants('primary')}>{t('findPeopleToFollow')}</Link>}/>)}
    {active && <>
      <div className={styles.toolbar}>
        <nav aria-label={t('sections')} className={styles.tabs}>{(['works', 'tastes'] as const).map(section => <button key={section} type="button" aria-pressed={state.section === section} onClick={() => selectSection(section)} className={styles.tab}><Icon kind={section}/>{t(section)}</button>)}</nav>
        <div className={styles.formats} role="group" aria-label={t('formatPills')}>{(['all', 'book', 'movie', 'series'] as const).map(next => <button key={next} type="button" aria-pressed={format === next} onClick={() => setFormat(next)}>{t(next === 'all' ? 'allFormatsShort' : `formats.${next}`)}</button>)}</div>
        <label className={styles.srOnly}>{t('format')}<select value={format} onChange={event => setFormat(event.target.value as Format)}>
          {(['all', 'book', 'movie', 'series'] as const).map(format => <option key={format} value={format}>{t(`formats.${format}`)}</option>)}
        </select></label>
      </div>
      <section aria-label={t('canvas')} aria-busy={state.snapshot.status === 'loading'} className={`${styles.workspace} ${state.section === 'tastes' ? styles.tasteWorkspace : ''}`}>
        {state.snapshot.status === 'loading' && <div className={styles.workspaceLoading}><ComparisonLoading label={t('loading')}/></div>}
        {state.snapshot.status === 'error' && <div role="alert"><p>{t(state.loadError === 'conflict' ? 'loadConflict' : `errors.${state.loadError ?? 'load-failed'}`)}</p><Button variant="secondary" onClick={() => { refresh(); if (state.loadError === 'unavailable' || state.loadError === 'unauthenticated') router.refresh(); }}>{t('reloadComparison')}</Button></div>}
        {snapshot && <div key={state.snapshot.seq} className={styles.workspaceContent} data-comparison-reveal>
          {state.section === 'tastes' && workspaceControls}
          <div data-comparison-slot={state.section} data-view={state.views[state.section].level} className={styles.canvasSlot}>
            {state.section === 'works' && <ComparisonCanvas snapshot={snapshot} controls={workspaceControls} selectedPeople={state.selection} onTogglePerson={togglePerson} view={state.views.works} onView={view => {
              if (view.level === 'venn') dispatch({ type: 'selection', people: view.people });
              dispatch({ type: 'view', view });
            }}/>}
            {state.section === 'tastes' && <Tastes snapshot={snapshot} people={state.views.tastes.level === 'group' ? state.selection : state.views.tastes.people} view={state.views.tastes} onView={view => dispatch({ type: 'view', view })} controls={state.tasteControls} onControlsChange={controls => dispatch({ type: 'tasteControls', controls })} onOpenWork={(key, origin) => dispatch({ type: 'view', view: { level: 'work', people: state.views.tastes.level === 'group' ? state.selection : state.views.tastes.people, key, origin } })}/>}
          </div>
        </div>}
        {/* Only data-free artwork survives the loading phase; fresh evidence is never delayed. */}
        {snapshot && state.revealSeq === state.snapshot.seq && completedHandoff !== state.snapshot.seq && <div key={`handoff-${state.snapshot.seq}`} aria-hidden="true" inert className={`${styles.workspaceLoading} ${styles.loadingExit}`} data-comparison-handoff onAnimationEnd={event => {
          if (event.target === event.currentTarget) setCompletedHandoff(state.snapshot.seq);
        }}><ComparisonLoading label={t('loading')}/></div>}
      </section>
    </>}
    <footer className={styles.footer}><Icon kind="lock"/>{t('privacyFooter')}</footer>
  </div>;
}
