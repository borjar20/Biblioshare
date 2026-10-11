// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../messages/es.json';
import type { Group } from '@/lib/comparisons/types';
const actions = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/comparisons/actions', () => ({ saveGroup: actions.save, deleteGroup: actions.remove }));
vi.mock('next/navigation', () => ({ usePathname: () => '/comunidad/entre-nosotros' }));
import { GroupEditor, suggestedName } from './group-editor';
const candidates = Array.from({ length: 11 }, (_, index) => ({ userId: `person${index}`, name: `Persona ${index}`, avatarUrl: null }));
const group: Group = { id: 'g', name: 'Lectores', revision: 2, members: candidates.slice(0, 2).map(person => ({ ...person, slotId: person.userId, available: true })) };
const callbacks = { onSaved: vi.fn(), onDeleted: vi.fn(), onCancel: vi.fn(), onReload: vi.fn() };
function mount(value: Group | null = null) { render(<NextIntlClientProvider locale="es" messages={messages}><GroupEditor group={value} candidates={candidates} viewerId="person0" {...callbacks}/></NextIntlClientProvider>); }
beforeEach(() => {
  // jsdom does not implement <dialog>.showModal; the editor sheet opens with it.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  vi.clearAllMocks(); actions.save.mockResolvedValue({ ok: true, data: group }); actions.remove.mockResolvedValue({ ok: true, data: null }); });
afterEach(cleanup);
describe('suggested group name (#1484)', () => {
  const more = (count: number) => `y ${count} más`;
  it('lists who is in the group and stays within 60 characters', () => {
    expect(suggestedName([], 'es', more)).toBe('');
    expect(suggestedName(['Tú', 'Ana'], 'es', more)).toBe('Tú y Ana');
    expect(suggestedName(['Tú', 'Ana', 'Carlos'], 'es', more)).toBe('Tú, Ana y Carlos');
    const long = ['Tú', 'Alejandra Montenegro', 'Bartolomé Villalobos', 'Constanza Echeverría'];
    expect(suggestedName(long, 'es', more)).toBe('Tú, Alejandra Montenegro y 2 más');
    expect([...suggestedName(['Tú', 'x'.repeat(80)], 'es', more)].length).toBe(60);
  });
  it('proposes the name from the selection until it is edited', () => {
    mount(); const name = () => (screen.getByRole('textbox', { name: 'Nombre del grupo' }) as HTMLInputElement).value;
    expect(name()).toBe('Tú');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 1' })); fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 2' }));
    expect(name()).toBe('Tú, Persona 1 y Persona 2');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del grupo' }), { target: { value: 'Lectores' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 3' })); expect(name()).toBe('Lectores');
  });
  it('keeps the saved name of an existing group', () => {
    mount(group); expect((screen.getByRole('textbox', { name: 'Nombre del grupo' }) as HTMLInputElement).value).toBe('Lectores');
  });
});
describe('inline group editing', () => {
  it('opens as a modal sheet with who is in the group on top: «Tú» first, removable chips after', () => {
    mount(); expect(screen.getByRole('dialog', { name: 'Crear grupo' })).toHaveProperty('open', true);
    const chips = () => within(screen.getByRole('region', { name: 'En el grupo' })).getAllByRole('listitem').map(item => item.querySelector(':scope > span:not([aria-hidden])')?.textContent);
    expect(chips()).toEqual(['Tú']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 2' })); fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 1' }));
    expect(chips()).toEqual(['Tú', 'Persona 2', 'Persona 1']);
    expect(within(screen.getByRole('region', { name: 'En el grupo' })).queryByRole('button', { name: 'Quitar a Tú' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Persona 2' }));
    expect(chips()).toEqual(['Tú', 'Persona 1']); expect((screen.getByRole('checkbox', { name: 'Persona 2' }) as HTMLInputElement).checked).toBe(false);
  });
  it('starts editing at the name, not at the close button the modal would focus', () => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; this.querySelector<HTMLElement>('button')?.focus(); };
    mount(group); expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Nombre del grupo' }));
  });
  it('closes through the sheet close button and reports a cancel', () => {
    mount(group); fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(callbacks.onCancel).toHaveBeenCalledOnce(); expect(actions.save).not.toHaveBeenCalled();
  });
  it('moves focus to safe cancel and restores Delete after inline cancellation', () => {
    mount(group); const trigger = screen.getByRole('button', { name: 'Eliminar grupo' });
    trigger.focus(); fireEvent.click(trigger);
    const cancel = screen.getAllByRole('button', { name: 'Cancelar' })[0];
    expect(document.activeElement).toBe(cancel); fireEvent.click(cancel);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Eliminar grupo' }));
  });
  it('includes the owner first by default, selects no one else, validates ten and rejects eleven', async () => {
    mount(); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Amigos' } });
    const save = screen.getByRole('button', { name: 'Guardar grupo' }) as HTMLButtonElement;
    expect((screen.getByLabelText('Incluirme en la comparación') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText('Persona 0')).toBeNull(); expect(screen.getByRole('status').textContent).toContain('1 de 10');
    expect(save.disabled).toBe(true); expect(within(screen.getByRole('group', { name: 'Personas que sigues' })).getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
    candidates.slice(1, 10).forEach(person => fireEvent.click(screen.getByRole('checkbox', { name: person.name })));
    expect(save.disabled).toBe(false); expect(screen.getByRole('status').textContent).toContain('10 de 10');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 10' })); expect(save.disabled).toBe(true);
    fireEvent.submit(screen.getByRole('form', { name: 'Crear grupo' })); expect(actions.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 10' })); fireEvent.submit(screen.getByRole('form', { name: 'Crear grupo' }));
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledWith(group));
    expect(actions.save).toHaveBeenCalledWith({ id: null, name: 'Amigos', userIds: candidates.slice(0, 10).map(person => person.userId), expectedRevision: null });
  });
  it('compares only other people once the owner opts out, and re-includes the owner first', async () => {
    mount(); fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Ellos' } });
    fireEvent.click(screen.getByLabelText('Incluirme en la comparación')); fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 2' })); fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 1' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Crear grupo' }));
    await waitFor(() => expect(actions.save).toHaveBeenLastCalledWith({ id: null, name: 'Ellos', userIds: ['person2', 'person1'], expectedRevision: null }));
    fireEvent.click(screen.getByLabelText('Incluirme en la comparación')); fireEvent.submit(screen.getByRole('form', { name: 'Crear grupo' }));
    await waitFor(() => expect(actions.save).toHaveBeenLastCalledWith({ id: null, name: 'Ellos', userIds: ['person0', 'person2', 'person1'], expectedRevision: null }));
  });
  it('can save two other people without the owner and preserves the revision', async () => {
    mount(group); expect((screen.getByLabelText('Incluirme en la comparación') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Incluirme en la comparación')); fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 2' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Editar grupo' }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith({ id: 'g', name: 'Lectores', userIds: ['person1', 'person2'], expectedRevision: 2 }));
  });
  it('preserves a draft and selection on save conflict until an explicit reload', async () => {
    actions.save.mockResolvedValue({ ok: false, code: 'conflict' }); mount(group);
    fireEvent.change(screen.getByLabelText('Nombre del grupo'), { target: { value: 'Mi borrador' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Persona 2' })); fireEvent.submit(screen.getByRole('form', { name: 'Editar grupo' }));
    await screen.findByRole('alert'); expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Mi borrador');
    expect((screen.getByRole('checkbox', { name: 'Persona 2' }) as HTMLInputElement).checked).toBe(true); expect(callbacks.onReload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recargar grupo' })); expect(callbacks.onReload).toHaveBeenCalledOnce();
  });
  it('filters candidates while retaining checked people and exposes keyboard controls', () => {
    mount(group); const search = screen.getByLabelText('Buscar personas'); search.focus(); expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: 'Persona 2' } }); expect(within(screen.getByRole('group', { name: 'Personas que sigues' })).getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain('2 de 10');
    const cancel = screen.getByRole('button', { name: 'Cancelar' }); cancel.focus(); expect(document.activeElement).toBe(cancel); fireEvent.click(cancel); expect(callbacks.onCancel).toHaveBeenCalledOnce();
  });
  it('shows unavailable slots without revealing their IDs and confirms deletion inline', async () => {
    mount({ ...group, members: [...group.members, { slotId: 'secret-slot', userId: null, name: null, avatarUrl: null, available: false }] });
    expect(screen.getByText('Hay una persona no disponible. Retírala del grupo para guardar los cambios.')).toBeTruthy();
    expect(screen.queryByText('secret-slot')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Eliminar grupo' }));
    expect(actions.remove).not.toHaveBeenCalled(); expect(screen.getAllByRole('dialog')).toHaveLength(1);
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
  it('counts characters, not UTF-16 units: 60 emoji fit, the 61st blocks saving', () => {
    mount(group); const input = screen.getByLabelText('Nombre del grupo') as HTMLInputElement;
    expect(input.getAttribute('aria-describedby')).toBe('comparison-group-name-count'); expect(screen.getByText('8/60')).toBeTruthy();
    fireEvent.change(input, { target: { value: '📚'.repeat(60) } });
    expect(screen.getByText('60/60')).toBeTruthy(); expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: 'Guardar grupo' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(input, { target: { value: '📚'.repeat(61) } });
    expect(screen.getByText('61/60')).toBeTruthy(); expect(screen.getByRole('alert').textContent).toBe('El nombre puede tener hasta 60 caracteres.');
    expect((screen.getByRole('button', { name: 'Guardar grupo' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows save failures and retains the edited name', async () => {
    actions.save.mockRejectedValue(new Error('offline')); mount(group); fireEvent.submit(screen.getByRole('form', { name: 'Editar grupo' }));
    await screen.findByRole('alert'); expect((screen.getByLabelText('Nombre del grupo') as HTMLInputElement).value).toBe('Lectores'); expect(callbacks.onSaved).not.toHaveBeenCalled();
  });
});
