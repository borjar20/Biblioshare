// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../../messages/es.json';
import { UltiPuzzle } from './ulti-puzzle';
afterEach(cleanup);
it('keeps recipes visible and submits a tile-slot permutation without a timer', () => {
 const confirm = vi.fn();
 render(<NextIntlClientProvider locale="es" messages={messages}><UltiPuzzle seed="00000001000000020000000300000004" tick={120} onConfirm={confirm} onCancel={vi.fn()} /></NextIntlClientProvider>);
 expect(document.activeElement).toBe(screen.getByRole('button',{name:'Ficha 1'}));
 expect(screen.getByText('Potencia')).toBeTruthy(); expect(screen.getByText('Protección')).toBeTruthy();
 expect(screen.getAllByRole('img', {name: /^Orden de fichas:/})).toHaveLength(2);
 for (let n=1;n<=4;n++) { fireEvent.click(screen.getByRole('button',{name:`Ficha ${n}`})); fireEvent.click(screen.getByRole('button',{name:`Hueco ${n}: vacío`})); }
 fireEvent.click(screen.getByRole('button',{name:'Lanzar ulti'})); expect(confirm).toHaveBeenCalledWith('0123');
});
it('skip sends the base effect payload and cancel does not submit', () => {
 const confirm=vi.fn(), cancel=vi.fn();
 render(<NextIntlClientProvider locale="es" messages={messages}><UltiPuzzle seed="00000001000000020000000300000004" tick={120} onConfirm={confirm} onCancel={cancel} /></NextIntlClientProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'})); expect(cancel).toHaveBeenCalledOnce(); expect(confirm).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Saltar · daño base'})); expect(confirm).toHaveBeenCalledWith('');
});
