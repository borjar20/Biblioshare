// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/es.json';
import { GroupSheet } from './group-sheet';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
const groups = [{ id: 'g1', name: 'Club', revision: 1, members: [] }, { id: 'g2', name: 'Casa', revision: 1, members: [] }];
function sheet(overrides = {}) {
  const props = { choices: groups, value: 'g1', unsavedId: null, activeName: 'Club', canEdit: true, canSaveUnsaved: false, showRefresh: true,
    onSelect: vi.fn(), onEdit: vi.fn(), onCreate: vi.fn(), onSaveUnsaved: vi.fn(), onRefresh: vi.fn(), ...overrides };
  render(<NextIntlClientProvider locale="es" messages={messages}><GroupSheet {...props}/></NextIntlClientProvider>);
  return props;
}

describe('GroupSheet', () => {
  it('el chip nombra el grupo y abre la hoja', () => {
    sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Grupo: Club' }));
    expect(screen.getByRole('dialog', { name: 'Grupos' }).hasAttribute('open')).toBe(true);
  });
  it('elegir un grupo avisa y cierra', () => {
    const props = sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Grupo: Club' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Grupo' }), { target: { value: 'g2' } });
    expect(props.onSelect).toHaveBeenCalledWith('g2');
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(false);
  });
  it('las acciones cierran la hoja y avisan', () => {
    const props = sheet();
    for (const [name, handler] of [['Editar grupo', 'onEdit'], ['Crear grupo', 'onCreate'], ['Actualizar', 'onRefresh']] as const) {
      fireEvent.click(screen.getByRole('button', { name: 'Grupo: Club' }));
      fireEvent.click(screen.getByRole('button', { name }));
      expect(props[handler]).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(false);
    }
  });
  it('sin grupo activo, el chip invita a elegir', () => {
    sheet({ value: null, activeName: null, canEdit: false, showRefresh: false });
    expect(screen.getByRole('button', { name: 'Grupo: Elige un grupo' })).toBeTruthy();
  });
});
