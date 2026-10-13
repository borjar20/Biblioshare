// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/es.json';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
type CanvasProps = { onActivate: (hit: { key: WorkKey; x: number; y: number } | null, type: string) => void; onHover: (hit: { key: WorkKey; x: number; y: number } | null) => void; active: string[] };
let canvas: CanvasProps;
vi.mock('./atlas-canvas', () => ({ AtlasCanvas: (props: CanvasProps) => { canvas = props; return <div data-testid="canvas"/>; } }));
import { AtlasView } from './atlas-view';

const member = (id: string, name: string, available = true) => ({ slotId: id, userId: available ? id : null, name: available ? name : null, avatarUrl: null, available });
const snapshot: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: [member('me', 'Tú'), member('b', 'Bea'), member('c', 'Carla'), member('x', '', false)] },
  format: 'all', excludedSeriesWithoutEpisodes: 0,
  catalog: [{ key: 'book:1', title: 'Proyecto Salvación', coverUrl: null, genres: [], creators: [] }],
  works: ['me', 'b', 'c'].map(userId => ({ userId, key: 'book:1' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }))
    .concat([{ userId: 'b', key: 'book:2' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }]) };
// The face selection is controlled by the explorer; this wrapper holds it like the explorer does.
function Harness({ notice }: { notice?: ReactNode }) {
  const [chosen, setChosen] = useState<string[] | null>(null);
  return <AtlasView snapshot={snapshot} viewerId="me" notice={notice} chosen={chosen} onChosenChange={setChosen}/>;
}
const view = (notice?: ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}><Harness notice={notice}/></NextIntlClientProvider>);
afterEach(() => { cleanup(); push.mockReset(); });
const summary = () => screen.getByRole('status').textContent;

describe('AtlasView', () => {
  it('empieza con todas las caras activas y resume lo común', () => {
    view();
    const faces = screen.getByRole('group', { name: 'Personas del cruce' });
    expect([...faces.querySelectorAll('button')].map(b => [b.textContent, b.getAttribute('aria-pressed'), b.disabled])).toEqual([
      ['TTú', 'true', false], ['BBea', 'true', false], ['CCarla', 'true', false], ['?Persona no disponible', null, true]]);
    expect(summary()).toBe('1 obra en común entre Tú, Bea y Carla');
  });
  it('desde 4 caras activas el resumen no lista nombres; al quitar una vuelve a la lista', () => {
    const four = ['me', 'b', 'c', 'd'];
    const names: Record<string, string> = { me: 'Tú', b: 'Bea', c: 'Carla', d: 'Dani' };
    const big: Snapshot = { ...snapshot, group: { ...snapshot.group, members: four.map(id => member(id, names[id])) },
      works: four.map(userId => ({ userId, key: 'book:1' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null })) };
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={big} viewerId="me" chosen={null} onChosenChange={vi.fn()}/></NextIntlClientProvider>);
    expect(summary()).toBe('1 obra en común entre las 4 personas');
    cleanup();
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={big} viewerId="me" chosen={['me', 'b', 'c']} onChosenChange={vi.fn()}/></NextIntlClientProvider>);
    expect(summary()).toBe('1 obra en común entre Tú, Bea y Carla');
  });
  it('pinta el aviso de cobertura bajo el resumen cuando se le pasa', () => {
    view(<p data-testid="notice">Aviso</p>);
    const notice = screen.getByTestId('notice');
    expect(notice.textContent).toBe('Aviso');
    expect(notice.previousElementSibling).toBe(screen.getByRole('status'));
  });
  it('alternar caras cambia el resumen y nunca deja menos de una', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Carla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tú' }));
    expect(summary()).toBe('2 obras de Bea. Suma a alguien para ver el cruce.');
    fireEvent.click(screen.getByRole('button', { name: 'Bea' }));
    expect(screen.getByRole('button', { name: 'Bea' }).getAttribute('aria-pressed')).toBe('true');
    expect(canvas.active).toEqual(['b']);
  });
  it('con una selección dada solo activa esas caras y avisa del cambio sin tocarla', () => {
    const onChosenChange = vi.fn();
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={snapshot} viewerId="me" chosen={['b', 'me']} onChosenChange={onChosenChange}/></NextIntlClientProvider>);
    expect(screen.getByRole('button', { name: 'Carla' }).getAttribute('aria-pressed')).toBe('false');
    expect(canvas.active).toEqual(['me', 'b']);
    fireEvent.click(screen.getByRole('button', { name: 'Tú' }));
    expect(onChosenChange).toHaveBeenCalledWith(['b']);
    expect(screen.getByRole('button', { name: 'Tú' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('si nadie de la selección sigue en el cruce, vuelven a estar todas las caras', () => {
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={snapshot} viewerId="me" chosen={['gone']} onChosenChange={vi.fn()}/></NextIntlClientProvider>);
    for (const name of ['Tú', 'Bea', 'Carla']) expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true');
    expect(summary()).toBe('1 obra en común entre Tú, Bea y Carla');
  });
  it('ratón: hover muestra la mini-ficha y clic navega', () => {
    view();
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    expect(screen.getByText('Proyecto Salvación')).toBeTruthy();
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'mouse'));
    expect(push).toHaveBeenCalledWith('/libro/1');
  });
  it('táctil: primer toque abre la hoja, segundo navega; tocar vacío la cierra', () => {
    view();
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    const sheet = screen.getByRole('dialog', { name: 'Proyecto Salvación' });
    expect(sheet.querySelector('a')?.getAttribute('href')).toBe('/libro/1');
    expect(push).not.toHaveBeenCalled();
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    expect(push).toHaveBeenCalledWith('/libro/1');
    act(() => canvas.onActivate(null, 'touch'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('una obra sin metadatos no ofrece ficha', () => {
    view();
    act(() => canvas.onActivate({ key: 'book:2', x: 10, y: 10 }, 'touch'));
    const sheet = screen.getByRole('dialog', { name: 'Obra sin información de catálogo' });
    expect(sheet.querySelector('a')).toBeNull();
  });
});
