'use client';
import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { loadComparison } from '@/lib/comparisons/actions';
import type { Candidate, Format, Group, Result, Snapshot } from '@/lib/comparisons/types';
import { Button } from '@/components/ui/button';
import { GroupEditor } from './group-editor';
import { ComparisonCanvas } from './canvas';
import { Tastes } from './tastes';
import { acceptResponse, changeGroup, changeSelection, clearEvidence, initialState, reconcileParticipants, reconcileView, selectOwnedGroup, setView } from './state';
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
      const next = sameFormat ? state : clearEvidence(state);
      const view = sameFormat && next.snapshot.value ? reconcileView(next.views[action.section], next.snapshot.value) : next.views[action.section];
      return { ...next, section: action.section, views: { ...next.views, [action.section]: view },
        selection: view.level === 'group' ? next.selection : [...view.people] };
    }
    case 'format': return { ...clearEvidence(state), formats: { ...state.formats, [state.section]: action.format } };
    case 'refresh': return clearEvidence(state);
    case 'selection': return changeSelection(state, action.people);
    case 'view': return setView(state, state.section, action.view);
    case 'loading': return { ...clearEvidence(state), snapshot: { seq: action.seq, value: null, status: 'loading' } };
    case 'response': {
      const snapshot = acceptResponse(state.snapshot, action.seq, action.result);
      if (snapshot === state.snapshot) return state;
      return { ...state, snapshot, loadError: action.result.ok ? null : action.result.code, views: snapshot.value ? {
        works: reconcileParticipants(state.views.works, snapshot.value.group),
        tastes: reconcileParticipants(state.views.tastes, snapshot.value.group),
        [state.section]: reconcileView(state.views[state.section], snapshot.value),
      } : state.views, selection: snapshot.value ? state.selection.filter(id => snapshot.value!.group.members.some(member => member.available && member.userId === id)) : state.selection };
    }
  }
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
      if (checking) { queued = true; checkSeq += 1; return; }
      checking = true; const seq = ++checkSeq; setVerification('checking');
      void client.auth.getUser().then(({ data, error }) => {
        if (disposed || invalidated) return;
        checking = false;
        if (queued) { queued = false; verify(); return; }
        if (seq !== checkSeq) return;
        if (error) setVerification('failed');
        else if (data.user?.id !== props.viewerId) invalidate();
        else setVerification('valid');
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
    void loadComparison(id, format).catch((): Result<Snapshot> => ({ ok: false, code: 'load-failed' })).then(result => {
      if (sequence.current !== seq) return;
      dispatch({ type: 'response', seq, result });
      if (result.ok) setGroups(current => current.map(group => group.id === id ? result.data.group : group));
    });
    return () => { sequence.current += 1; };
  }, [state.groupId, format, reload]);
  function selectGroup(id: string | null) {
    sequence.current += 1; dispatch({ type: 'group', id }); setEditor(null);
    groupSelector.current?.focus();
    router.replace(`/comunidad/entre-nosotros${id ? `?group=${id}` : ''}`, { scroll: false });
  }
  function refresh() { sequence.current += 1; dispatch({ type: 'refresh' }); forceReload(); }
  function onSaved(group: Group) {
    setGroups(current => [...current.filter(item => item.id !== group.id), group]); selectGroup(group.id);
    // Even a same-group save invalidates the old revision and permissions.
    forceReload();
  }
  function togglePerson(userId: string) {
    dispatch({ type: 'selection', people: state.selection.includes(userId) ? state.selection.filter(id => id !== userId) : [...state.selection, userId] });
  }
  function setFormat(next: Format) { sequence.current += 1; dispatch({ type: 'format', format: next }); }
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
    {editor && <GroupEditor key={editor.group?.id ?? 'new'} group={editor.group} candidates={candidates} onSaved={onSaved} onDeleted={id => { setGroups(current => current.filter(group => group.id !== id)); selectGroup(null); }} onCancel={() => { setEditor(null); groupSelector.current?.focus(); }} onReload={() => { setEditor(null); groupSelector.current?.focus(); refresh(); router.refresh(); }}/>}
    {!groups.length && !editor && <p className="py-10 text-muted-foreground">{t('noGroups')}</p>}
    {active && <>
      <div className={styles.toolbar}>
        <nav aria-label={t('sections')} className={styles.tabs}>{(['works', 'tastes'] as const).map(section => <button key={section} type="button" aria-pressed={state.section === section} onClick={() => dispatch({ type: 'section', section })} className={styles.tab}><Icon kind={section}/>{t(section)}</button>)}</nav>
        <div className={styles.formats} role="group" aria-label={t('formatPills')}>{(['all', 'book', 'movie', 'series'] as const).map(next => <button key={next} type="button" aria-pressed={format === next} onClick={() => setFormat(next)}>{t(next === 'all' ? 'allFormatsShort' : `formats.${next}`)}</button>)}</div>
        <label className={styles.srOnly}>{t('format')}<select value={format} onChange={event => setFormat(event.target.value as Format)}>
          {(['all', 'book', 'movie', 'series'] as const).map(format => <option key={format} value={format}>{t(`formats.${format}`)}</option>)}
        </select></label>
      </div>
      <section aria-label={t('canvas')} aria-busy={state.snapshot.status === 'loading'} className={`${styles.workspace} ${state.section === 'tastes' ? styles.tasteWorkspace : ''}`}>
        {state.snapshot.status === 'loading' && <p role="status">{t('loading')}</p>}
        {state.snapshot.status === 'error' && <div role="alert"><p>{t(state.loadError === 'conflict' ? 'loadConflict' : `errors.${state.loadError ?? 'load-failed'}`)}</p><Button variant="secondary" onClick={() => { refresh(); if (state.loadError === 'unavailable' || state.loadError === 'unauthenticated') router.refresh(); }}>{t('reloadComparison')}</Button></div>}
        {snapshot && <>
          <div className={styles.workspaceControls}>
            <h2 className={styles.srOnly}>{snapshot.group.name}</h2>
            {(state.section === 'tastes' || state.views.works.level !== 'group') && <fieldset className={styles.people}><legend className={styles.srOnly}>{t(state.section === 'works' ? 'selectPair' : 'selectTastes')}</legend>{snapshot.group.members.map(member => member.available && member.userId ? <label key={member.slotId} className={styles.personChip} data-selected={state.selection.includes(member.userId)} style={{ '--person': personColor(snapshot, member.userId) } as CSSProperties}><input type="checkbox" checked={state.selection.includes(member.userId)} onChange={() => togglePerson(member.userId!)}/><span className={styles.personDot} aria-hidden="true"/>{member.name}</label> : <span key={member.slotId} className={styles.unavailable}>{t('unavailablePerson')}</span>)}</fieldset>}
            <Button variant="ghost" onClick={refresh}>{t('refreshAccess')}</Button>
          </div>
          {snapshot.excludedSeriesWithoutEpisodes > 0 && <p className="py-3 text-sm text-muted-foreground" data-comparison-coverage>{t('excludedHistoricalSeries', { count: snapshot.excludedSeriesWithoutEpisodes })}</p>}
          <div data-comparison-slot={state.section} data-view={state.views[state.section].level} className="min-h-48">
            {state.section === 'works' && <ComparisonCanvas snapshot={snapshot} selectedPeople={state.selection} onTogglePerson={togglePerson} view={state.views.works} onView={view => {
              if (view.level === 'venn') dispatch({ type: 'selection', people: view.people });
              dispatch({ type: 'view', view });
            }}/>}
            {state.section === 'tastes' && <Tastes snapshot={snapshot} people={state.views.tastes.level === 'group' ? state.selection : state.views.tastes.people} view={state.views.tastes} onView={view => dispatch({ type: 'view', view })} controls={state.tasteControls} onControlsChange={controls => dispatch({ type: 'tasteControls', controls })} onOpenWork={(key, origin) => dispatch({ type: 'view', view: { level: 'work', people: state.views.tastes.level === 'group' ? state.selection : state.views.tastes.people, key, origin } })}/>}
          </div>
        </>}
      </section>
    </>}
    <footer className={styles.footer}><Icon kind="lock"/>{t('privacyFooter')}</footer>
  </div>;
}
