'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { deleteGroup, saveGroup } from '@/lib/comparisons/actions';
import type { Candidate, Group, Result } from '@/lib/comparisons/types';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = { group: Group | null; initialPeople?: string[]; candidates: Candidate[]; viewerId: string; onSaved: (group: Group) => void;
  onDeleted: (id: string) => void; onCancel: () => void; onReload: () => void };
/**
 * Group editor as a sheet (#1486): a native <dialog> like the repo's other sheets
 * (Escape, focus trap and inert background for free), docked at the bottom on
 * mobile and centred on `lg`. Who is in the group sits on top as removable chips;
 * search and the followed people with their avatars come below.
 */
export function GroupEditor({ group, initialPeople, candidates, viewerId, onSaved, onDeleted, onCancel, onReload }: Props) {
  const t = useTranslations('comparisons'); const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const openedAt = useRef(pathname);
  // The owner is a toggle, not a search result: a new group includes them first.
  const self = candidates.find(person => person.userId === viewerId);
  const others = candidates.filter(person => person.userId !== viewerId);
  const people = new Map(candidates.map(person => [person.userId, person]));
  // A new group proposes its name from who is in it until the name is edited (#1484).
  const [draftName, setDraftName] = useState<string | null>(group?.name ?? null);
  const [selected, setSelected] = useState<string[]>(group?.members.flatMap(member => member.userId ? [member.userId] : []) ?? initialPeople ?? (self ? [viewerId] : []));
  const name = draftName ?? suggestedName(selected.flatMap(id => id === viewerId ? [t('editorYou')] : people.get(id) ? [people.get(id)!.name] : []), locale, count => t('suggestedNameMore', { count }));
  const includesSelf = selected.includes(viewerId);
  const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Extract<Result<never>, { ok: false }>['code'] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [unavailable, setUnavailable] = useState(group?.members.filter(member => !member.available).map(member => member.slotId) ?? []);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const deleteCancel = useRef<HTMLButtonElement>(null);
  const deleteFocus = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  // showModal focuses the first control (the close button); the name is where editing starts.
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); nameInput.current?.focus(); }, []);
  // A soft navigation can keep this mounted outside the top layer (#448): close it.
  useEffect(() => { if (pathname !== openedAt.current) dialog.current?.close(); }, [pathname]);
  useLayoutEffect(() => {
    if (deleteFocus.current) (confirmDelete ? deleteCancel : deleteTrigger).current?.focus();
    deleteFocus.current = false;
  }, [confirmDelete]);
  const pending = useRef(false);
  const nameLength = [...name.trim()].length;
  const valid = !!name.trim() && nameLength <= 60 && selected.length >= 2 && selected.length <= 10 && unavailable.length === 0;
  const participantCount = selected.length + unavailable.length;
  const matches = others.filter(person => person.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const toggle = (userId: string, on: boolean) => setSelected(current => on ? [...current, userId] : current.filter(id => id !== userId));
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
  const title = t(group ? 'editGroup' : 'createGroup');
  return <dialog ref={dialog} aria-label={title} onClose={onCancel}
    onCancel={event => { if (busy) event.preventDefault(); }}
    onClick={event => { if (event.target === dialog.current && !busy) dialog.current?.close(); }}
    className="m-auto mt-auto mb-0 w-full max-w-lg rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim lg:mb-auto lg:rounded-2xl">
    <form onSubmit={event => { event.preventDefault(); void submit(); }} aria-label={title} className="flex max-h-[85svh] flex-col">
      <header className="flex items-center gap-3 border-b border-border px-5 pt-3.5 pb-3">
        <h2 className="min-w-0 flex-1 truncate font-serif text-lg font-semibold">{title}</h2>
        <button type="button" disabled={busy} onClick={() => dialog.current?.close()} aria-label={t('closeEditor')} className="tap-44 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border">✕</button>
      </header>
      {/* Children keep their height: in a scrolling column they would otherwise shrink and overlap. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 [&>*]:shrink-0">
        {/* maxLength counts UTF-16 units; 120 lets 60 emoji through. The 60-character limit is the counter's. */}
        <label className="flex flex-col gap-2 text-sm font-medium">{t('groupName')}<Input ref={nameInput} value={name} onChange={event => setDraftName(event.target.value)} maxLength={120} aria-describedby="comparison-group-name-count" disabled={busy} autoFocus required/></label>
        <p id="comparison-group-name-count" className={`-mt-2 self-end text-xs tabular-nums ${nameLength > 60 ? 'text-status-dropped' : 'text-muted-foreground'}`}>{t('nameCounter', { count: nameLength })}</p>
        {nameLength > 60 && <p role="alert" className="text-sm text-status-dropped">{t('nameTooLong')}</p>}
        <section aria-labelledby="comparison-selected-title" className="flex flex-col gap-2">
          <h3 id="comparison-selected-title" className="label-section">{t('selectedPeople')}</h3>
          {selected.length === 0 && unavailable.length === 0 ? <p className="text-sm text-muted-foreground">{t('nobodySelected')}</p> : <ul className="flex flex-wrap gap-1.5">
            {selected.map(userId => {
              const person = people.get(userId); const own = userId === viewerId;
              const label = own ? t('editorYou') : person?.name ?? t('unavailablePerson');
              return <li key={userId} className="flex items-center gap-1.5 rounded-full border border-accent bg-accent/15 py-1 pr-1 pl-1 text-xs">
                <span aria-hidden="true"><UserAvatar name={person?.name ?? label} avatarUrl={person?.avatarUrl ?? null} size={20}/></span>
                <span className="max-w-[9rem] truncate">{label}</span>
                {own ? <span className="w-1.5"/> : <button type="button" disabled={busy} onClick={() => toggle(userId, false)} aria-label={t('removePerson', { name: label })} className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground">✕</button>}
              </li>;
            })}
          </ul>}
          {unavailable.length > 0 && <div className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">{t('unavailableEditor', { count: unavailable.length })}</p>{unavailable.map(slotId => <div key={slotId} className="flex flex-wrap items-center gap-2"><span className="text-sm">{t('unavailablePerson')}</span><Button type="button" variant="secondary" disabled={busy} onClick={() => { setUnavailable(current => current.filter(id => id !== slotId)); nameInput.current?.focus(); }}>{t('removeUnavailable')}</Button></div>)}</div>}
          <p id="comparison-group-count" role="status" className="text-xs text-muted-foreground">{t('participantCount', { count: participantCount })} {participantCount < 2 || participantCount > 10 ? t('groupSize') : ''}</p>
        </section>
        {self && <div className="flex min-h-11 items-start gap-3 rounded-md border border-border px-3 py-2">
          <input id="comparison-include-self" type="checkbox" checked={includesSelf} disabled={busy} aria-describedby="comparison-include-self-hint" onChange={event => setSelected(current => event.target.checked ? [viewerId, ...current] : current.filter(id => id !== viewerId))} className="mt-1 size-4 accent-accent"/>
          <span className="flex flex-col"><label htmlFor="comparison-include-self" className="font-medium">{t('includeMe')}</label><span id="comparison-include-self-hint" className="text-sm text-muted-foreground">{t('includeMeHint')}</span></span>
        </div>}
        <label className="flex flex-col gap-2 text-sm font-medium">{t('searchPeople')}<Input type="search" value={query} onChange={event => setQuery(event.target.value)} disabled={busy}/></label>
        <fieldset disabled={busy} className="flex flex-col gap-1"><legend className="mb-1 text-sm font-medium">{t('participants')}</legend>
          {matches.map(person => <label key={person.userId} className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-surface-muted">
            <input type="checkbox" checked={selected.includes(person.userId)} onChange={event => toggle(person.userId, event.target.checked)} className="size-4 accent-accent"/>
            <span aria-hidden="true"><UserAvatar name={person.name} avatarUrl={person.avatarUrl} size={28}/></span>{person.name}
          </label>)}
        </fieldset>
        {matches.length === 0 && <p className="text-sm text-muted-foreground">{t(others.length ? 'noCandidates' : 'noFollowsToAdd')}</p>}
        <p className="text-xs text-muted-foreground">{t('groupHelp')}</p>
        {group && <div className="border-t border-border pt-3">{confirmDelete ? <div className="flex flex-wrap items-center gap-2"><p className="text-sm">{t('deleteConfirm')}</p><Button type="button" variant="danger" disabled={busy} onClick={() => void remove()}>{t('confirmDelete')}</Button><Button type="button" ref={deleteCancel} variant="ghost" disabled={busy} onClick={() => { deleteFocus.current = true; setConfirmDelete(false); }}>{t('cancel')}</Button></div> : <Button type="button" ref={deleteTrigger} variant="ghost" disabled={busy} onClick={() => { deleteFocus.current = true; setConfirmDelete(true); }}>{t('deleteGroup')}</Button>}</div>}
      </div>
      <footer className="flex flex-col gap-2 border-t border-border px-5 py-3">
        {error && <div role="alert" className="text-sm"><p>{t(error === 'conflict' ? 'saveConflict' : `errors.${error}`)}</p>{error === 'conflict' && <Button type="button" variant="secondary" onClick={onReload}>{t('reloadGroups')}</Button>}</div>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>{t('cancel')}</Button><Button type="submit" disabled={busy || !valid} aria-describedby="comparison-group-count">{t(busy ? 'saving' : 'save')}</Button></div>
      </footer>
    </form>
  </dialog>;
}

/** «Tú, Ana y Carlos»; past 60 characters, «Tú, Ana y 3 más». Never longer than the saved limit. */
export function suggestedName(labels: string[], locale: string, more: (count: number) => string): string {
  if (!labels.length) return '';
  const full = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(labels);
  if ([...full].length <= 60 || labels.length < 3) return [...full].slice(0, 60).join('').trim();
  const short = `${labels.slice(0, 2).join(', ')} ${more(labels.length - 2)}`;
  return [...short].slice(0, 60).join('').trim();
}
