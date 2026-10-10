// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../messages/es.json';
import type { Group } from '@/lib/comparisons/types';
const actions = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/comparisons/actions', () => ({ saveGroup: actions.save, deleteGroup: actions.remove }));
import { GroupEditor } from './group-editor';
const candidates = Array.from({ length: 11 }, (_, index) => ({ userId: `person${index}`, name: `Persona ${index}`, avatarUrl: null }));
const group: Group = { id: 'g', name: 'Lectores', revision: 2, members: candidates.slice(0, 2).map(person => ({ ...person, slotId: person.userId, available: true })) };
const callbacks = { onSaved: vi.fn(), onDeleted: vi.fn(), onCancel: vi.fn(), onReload: vi.fn() };
function mount(value: Group | null = null) { render(<NextIntlClientProvider locale="es" messages={messages}><GroupEditor group={value} candidates={candidates} {...callbacks}/></NextIntlClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); actions.save.mockResolvedValue({ ok: true, data: group }); actions.remove.mockResolvedValue({ ok: true, data: null }); });
afterEach(cleanup);
describe('inline group editing', () => {
  it('moves focus to safe cancel and restores Delete after inline cancellation', () => {
    mount(group); const trigger = screen.getByRole('button', { name: 'Eliminar grupo' });
    trigger.focus(); fireEvent.click(trigger);
    const cancel = screen.getAllByRole('button', { name: 'Cancelar' })[1];
    expect(document.activeElement).toBe(cancel); fireEvent.click(cancel);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Eliminar grupo' }));
  });
  it('selects no one arbitrarily, validates ten and rejects eleven', async () => {
    mount(); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Amigos' } });
    const save = screen.getByRole('button', { name: 'Guardar grupo' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); expect(screen.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
    candidates.slice(0, 10).forEach(person => fireEvent.click(screen.getByLabelText(person.name)));
    expect(save.disabled).toBe(false); expect(screen.getByRole('status').textContent).toContain('10 de 10');
    fireEvent.click(screen.getByLabelText('Persona 10')); expect(save.disabled).toBe(true);
    fireEvent.submit(screen.getByRole('form', { name: 'Crear grupo' })); expect(actions.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Persona 10')); fireEvent.submit(screen.getByRole('form', { name: 'Crear grupo' }));
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledWith(group));
    expect(actions.save).toHaveBeenCalledWith({ id: null, name: 'Amigos', userIds: candidates.slice(0, 10).map(person => person.userId), expectedRevision: null });
  });
  it('can save two other people without the owner and preserves the revision', async () => {
    mount(group); fireEvent.click(screen.getByLabelText('Persona 0')); fireEvent.click(screen.getByLabelText('Persona 2'));
    fireEvent.submit(screen.getByRole('form', { name: 'Editar grupo' }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith({ id: 'g', name: 'Lectores', userIds: ['person1', 'person2'], expectedRevision: 2 }));
  });
  it('preserves a draft and selection on save conflict until an explicit reload', async () => {
    actions.save.mockResolvedValue({ ok: false, code: 'conflict' }); mount(group);
    fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Mi borrador' } });
    fireEvent.click(screen.getByLabelText('Persona 2')); fireEvent.submit(screen.getByRole('form', { name: 'Editar grupo' }));
    await screen.findByRole('alert'); expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Mi borrador');
    expect((screen.getByLabelText('Persona 2') as HTMLInputElement).checked).toBe(true); expect(callbacks.onReload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recargar grupo' })); expect(callbacks.onReload).toHaveBeenCalledOnce();
  });
  it('filters candidates while retaining checked people and exposes keyboard controls', () => {
    mount(group); const search = screen.getByLabelText('Buscar personas'); search.focus(); expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: 'Persona 2' } }); expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain('2 de 10');
    const cancel = screen.getByRole('button', { name: 'Cancelar' }); cancel.focus(); expect(document.activeElement).toBe(cancel); fireEvent.click(cancel); expect(callbacks.onCancel).toHaveBeenCalledOnce();
  });
  it('shows unavailable slots without revealing their IDs and confirms deletion inline', async () => {
    mount({ ...group, members: [...group.members, { slotId: 'secret-slot', userId: null, name: null, avatarUrl: null, available: false }] });
    expect(screen.getByText('Hay una persona no disponible. Retírala del grupo para guardar los cambios.')).toBeTruthy();
    expect(screen.queryByText('secret-slot')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Eliminar grupo' }));
    expect(actions.remove).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' })); await waitFor(() => expect(callbacks.onDeleted).toHaveBeenCalledWith('g'));
    expect(actions.remove).toHaveBeenCalledWith('g', 2);
  });
  it('requires an explicit unavailable-slot removal before a name edit can save', async () => {
    mount({ ...group, members: [...group.members, { slotId: 'hidden', userId: null, name: null, avatarUrl: null, available: false }] });
    fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Nombre nuevo' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Editar grupo' })); expect(actions.save).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Guardar grupo' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retirar persona no disponible' }));
    expect((screen.getByRole('button', { name: 'Guardar grupo' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.submit(screen.getByRole('form', { name: 'Editar grupo' })); await waitFor(() => expect(actions.save).toHaveBeenCalledOnce());
  });
  it('shows save failures and retains the edited name', async () => {
    actions.save.mockRejectedValue(new Error('offline')); mount(group); fireEvent.submit(screen.getByRole('form', { name: 'Editar grupo' }));
    await screen.findByRole('alert'); expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Lectores'); expect(callbacks.onSaved).not.toHaveBeenCalled();
  });
});
