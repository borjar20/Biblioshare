'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deleteGroup, saveGroup } from '@/lib/comparisons/actions';
import type { Candidate, Group, Result } from '@/lib/comparisons/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = { group: Group | null; candidates: Candidate[]; onSaved: (group: Group) => void;
  onDeleted: (id: string) => void; onCancel: () => void; onReload: () => void };
export function GroupEditor({ group, candidates, onSaved, onDeleted, onCancel, onReload }: Props) {
  const t = useTranslations('comparisons');
  const [name, setName] = useState(group?.name ?? '');
  const [selected, setSelected] = useState<string[]>(group?.members.flatMap(member => member.userId ? [member.userId] : []) ?? []);
  const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Extract<Result<never>, { ok: false }>['code'] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [unavailable, setUnavailable] = useState(group?.members.filter(member => !member.available).map(member => member.slotId) ?? []);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const deleteCancel = useRef<HTMLButtonElement>(null);
  const deleteFocus = useRef(false);
  useLayoutEffect(() => {
    if (deleteFocus.current) (confirmDelete ? deleteCancel : deleteTrigger).current?.focus();
    deleteFocus.current = false;
  }, [confirmDelete]);
  const pending = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const valid = !!name.trim() && [...name.trim()].length <= 60 && selected.length >= 2 && selected.length <= 10 && unavailable.length === 0;
  const participantCount = selected.length + unavailable.length;
  async function submit() {
    if (!valid || pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await saveGroup({ id: group?.id ?? null, name, userIds: selected, expectedRevision: group?.revision ?? null });
      if (result.ok) onSaved(result.data); else setError(result.code);
    } catch { setError('load-failed'); } finally { pending.current = false; setBusy(false); }
  }
  async function remove() {
    if (!group || pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { const result = await deleteGroup(group.id, group.revision); if (result.ok) onDeleted(group.id); else setError(result.code); }
    catch { setError('load-failed'); } finally { pending.current = false; setBusy(false); }
  }
  return <form onSubmit={event => { event.preventDefault(); void submit(); }} className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border bg-surface p-5" aria-label={t(group ? 'editGroup' : 'createGroup')}>
    <h2 className="font-serif text-xl font-semibold">{t(group ? 'editGroup' : 'createGroup')}</h2>
    <label className="flex flex-col gap-2">{t('groupName')}<Input ref={nameInput} value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={busy} autoFocus required/></label>
    {[...name.trim()].length > 60 && <p role="alert" className="text-sm text-status-dropped">{t('nameTooLong')}</p>}
    <p className="text-sm text-muted-foreground">{t('groupHelp')}</p>
    {unavailable.length > 0 && <div className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">{t('unavailableEditor', { count: unavailable.length })}</p>{unavailable.map(slotId => <div key={slotId} className="flex flex-wrap items-center gap-2"><span>{t('unavailablePerson')}</span><Button type="button" variant="secondary" disabled={busy} onClick={() => { setUnavailable(current => current.filter(id => id !== slotId)); nameInput.current?.focus(); }}>{t('removeUnavailable')}</Button></div>)}</div>}
    <label className="flex flex-col gap-2">{t('searchPeople')}<Input type="search" value={query} onChange={event => setQuery(event.target.value)} disabled={busy}/></label>
    <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-medium">{t('participants')}</legend>
      {candidates.filter(person => person.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(person => <label key={person.userId} className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-surface-muted">
        <input type="checkbox" checked={selected.includes(person.userId)} onChange={event => setSelected(current => event.target.checked ? [...current, person.userId] : current.filter(id => id !== person.userId))} className="size-4 accent-accent"/>{person.name}
      </label>)}
    </fieldset>
    {candidates.filter(person => person.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).length === 0 && <p>{t('noCandidates')}</p>}
    <p id="comparison-group-count" role="status" className="text-sm">{t('participantCount', { count: participantCount })} {participantCount < 2 || participantCount > 10 ? t('groupSize') : ''}</p>
    {error && <div role="alert"><p>{t(error === 'conflict' ? 'saveConflict' : `errors.${error}`)}</p>{error === 'conflict' && <Button type="button" variant="secondary" onClick={onReload}>{t('reloadGroups')}</Button>}</div>}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !valid} aria-describedby="comparison-group-count">{t(busy ? 'saving' : 'save')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>{t('cancel')}</Button></div>
    {group && <div className="border-t border-border pt-3">{confirmDelete ? <div className="flex flex-wrap items-center gap-2"><p>{t('deleteConfirm')}</p><Button type="button" variant="danger" disabled={busy} onClick={() => void remove()}>{t('confirmDelete')}</Button><Button type="button" ref={deleteCancel} variant="ghost" disabled={busy} onClick={() => { deleteFocus.current = true; setConfirmDelete(false); }}>{t('cancel')}</Button></div> : <Button type="button" ref={deleteTrigger} variant="ghost" disabled={busy} onClick={() => { deleteFocus.current = true; setConfirmDelete(true); }}>{t('deleteGroup')}</Button>}</div>}
  </form>;
}
