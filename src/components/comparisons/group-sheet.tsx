'use client';
import { useRef, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import type { Group } from '@/lib/comparisons/types';
import styles from './explorer.module.css';

type Props = { choices: Group[]; value: string | null; unsavedId: string | null; activeName: string | null;
  canEdit: boolean; canSaveUnsaved: boolean; showRefresh: boolean;
  onSelect: (id: string) => void; onEdit: () => void; onCreate: () => void; onSaveUnsaved: () => void; onRefresh: () => void;
  chipRef?: Ref<HTMLButtonElement> };

/** Group chip + native <dialog> sheet: picking, creating, editing or refreshing all close it first. */
export function GroupSheet({ chipRef, choices, value, unsavedId, activeName, canEdit, canSaveUnsaved, showRefresh, onSelect, onEdit, onCreate, onSaveUnsaved, onRefresh }: Props) {
  const t = useTranslations('comparisons'); const dialog = useRef<HTMLDialogElement>(null);
  const closeThen = (action: () => void) => { dialog.current?.close(); action(); };
  return <>
    <button ref={chipRef} type="button" className={styles.groupChip} onClick={() => dialog.current?.showModal()}
      aria-label={t('atlas.groupChip', { name: activeName ?? t('chooseGroup') })}>
      <span>{activeName ?? t('chooseGroup')}</span><span aria-hidden="true">▾</span>
    </button>
    <dialog ref={dialog} className={styles.groupSheet} aria-label={t('atlas.groups')}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.groupSheetBody}>
        <p className={styles.private}>{t('privateSelection')}</p>
        <label className={styles.groupField}><span>{t('group')}</span>
          <select className={styles.groupSelect} value={value ?? ''} onChange={event => { dialog.current?.close(); onSelect(event.target.value); }}>
            <option value="">{t('chooseGroup')}</option>
            {choices.map(group => <option key={group.id} value={group.id}>{group.id === unsavedId ? t('unsavedOption', { name: group.name }) : group.name}</option>)}
          </select></label>
        <div className={styles.groupActions}>
          {canEdit && <button type="button" onClick={() => closeThen(onEdit)}>{t('editGroup')}</button>}
          {canSaveUnsaved && <button type="button" onClick={() => closeThen(onSaveUnsaved)}>{t('saveAsGroup')}</button>}
          <button type="button" onClick={() => closeThen(onCreate)}>{t('createGroup')}</button>
          {showRefresh && <button type="button" title={t('refreshAccessHint')} onClick={() => closeThen(onRefresh)}>{t('refreshAccess')}</button>}
        </div>
        <p className={styles.sheetFooter}>{t('privacyFooter')}</p>
      </div>
    </dialog>
  </>;
}
