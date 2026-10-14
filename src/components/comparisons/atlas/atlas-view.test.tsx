// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, act, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState, type ReactNode, type Ref } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/es.json';
import type { Snapshot, WorkKey } from '@/lib/comparisons/types';
import type { Lens, Scene } from '@/lib/comparisons/atlas/scene';
import type { QuienLayout } from '@/lib/comparisons/atlas/layout';
import type { Island, IslandMode } from '@/lib/comparisons/atlas/islands';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
type SavedCamera = { lens: Lens; x: number; y: number; k: number };
type CanvasProps = { quien: QuienLayout; scene: Scene; islandText?: { title: (island: Island) => string; common: (count: number) => string }; opinionLabels?: Record<string, string>; onActivate: (hit: { key: WorkKey; x: number; y: number } | null, type: string) => void; onHover: (hit: { key: WorkKey; x: number; y: number } | null) => void; active: string[]; label: string;
  initialCamera?: { x: number; y: number; k: number }; onSettled?: (camera: SavedCamera, own: boolean) => void };
let canvas: CanvasProps;
const canvasFocus = vi.fn();
const handle = { zoomBy: vi.fn(), fit: vi.fn(), panBy: vi.fn() };
vi.mock('./atlas-canvas', async () => {
  const { useImperativeHandle } = await vi.importActual<typeof import('react')>('react');
  return { AtlasCanvas: (props: CanvasProps & { ref?: Ref<unknown> }) => {
    canvas = props;
    useImperativeHandle(props.ref, () => ({ zoomBy: handle.zoomBy, fit: handle.fit, panBy: handle.panBy, camera: () => ({ lens: 'quien', x: 0, y: 0, k: 1 }), focus: canvasFocus }), []);
    return <div data-testid="canvas" tabIndex={0}/>;
  } };
});
import { AtlasView } from './atlas-view';

const member = (id: string, name: string, available = true) => ({ slotId: id, userId: available ? id : null, name: available ? name : null, avatarUrl: null, available });
const snapshot: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: [member('me', 'Tú'), member('b', 'Bea'), member('c', 'Carla'), member('x', '', false)] },
  format: 'all', excludedSeriesWithoutEpisodes: 0,
  catalog: [{ key: 'book:1', title: 'Proyecto Salvación', coverUrl: null, genres: [], creators: [] }],
  works: ['me', 'b', 'c'].map(userId => ({ userId, key: 'book:1' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }))
    .concat([{ userId: 'b', key: 'book:2' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }]) };
// The face selection is controlled by the explorer; this wrapper holds it like the explorer does.
function Harness({ notice, data = snapshot, initialLens = 'quien', initialMode = 'type' }: { notice?: ReactNode; data?: Snapshot; initialLens?: Lens; initialMode?: IslandMode }) {
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [lens, setLens] = useState<Lens>(initialLens);
  const [islandMode, setIslandMode] = useState<IslandMode>(initialMode);
  const [list, setList] = useState(false);
  return <AtlasView snapshot={data} viewerId="me" groupId="g" notice={notice} chosen={chosen} onChosenChange={setChosen} lens={lens} onLensChange={setLens}
    islandMode={islandMode} onIslandModeChange={setIslandMode} list={list} onListChange={setList}/>;
}
const viewWith = (data: Snapshot, initialLens?: Lens, initialMode?: IslandMode) =>
  render(<NextIntlClientProvider locale="es" messages={messages}><Harness data={data} initialLens={initialLens} initialMode={initialMode}/></NextIntlClientProvider>);
/** Same snapshot, with `book:1` filed under a genre. */
const withGenre: Snapshot = { ...snapshot, catalog: snapshot.catalog.map(item => ({ ...item, genres: ['Ciencia ficción'] })) };
const view = (notice?: ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}><Harness notice={notice}/></NextIntlClientProvider>);
/** Same snapshot, with `book:1` rated by each person as given. */
const viewRated = (ratings: Record<string, number>) => render(<NextIntlClientProvider locale="es" messages={messages}>
  <Harness data={{ ...snapshot, works: snapshot.works.map(work => work.key === 'book:1' ? { ...work, rating: ratings[work.userId] ?? null } : work) }}/>
</NextIntlClientProvider>);
afterEach(() => { cleanup(); push.mockReset(); canvasFocus.mockReset(); Object.values(handle).forEach(fn => fn.mockReset()); sessionStorage.clear(); });
const summary = () => screen.getByRole('status').textContent;
const readCamera = () => JSON.parse(sessionStorage.getItem('biblioshare:atlas:me:g') ?? '{}').camera ?? null;

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
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={big} viewerId="me" groupId="g" chosen={null} onChosenChange={vi.fn()} lens="quien" onLensChange={vi.fn()} islandMode="type" onIslandModeChange={vi.fn()} list={false} onListChange={vi.fn()}/></NextIntlClientProvider>);
    expect(summary()).toBe('1 obra en común entre las 4 personas');
    cleanup();
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={big} viewerId="me" groupId="g" chosen={['me', 'b', 'c']} onChosenChange={vi.fn()} lens="quien" onLensChange={vi.fn()} islandMode="type" onIslandModeChange={vi.fn()} list={false} onListChange={vi.fn()}/></NextIntlClientProvider>);
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
  it('Quién reagrupa la escena al apagar caras y restaura los destinos al encenderlas', () => {
    const data: Snapshot = { ...snapshot, works: [...snapshot.works,
      ...['me', 'b'].map(userId => ({ userId, key: 'book:3' as WorkKey, rating: null, date: null, orderUnknown: false, progress: null })),
      { userId: 'c', key: 'book:4', rating: null, date: null, orderUnknown: false, progress: null },
    ] };
    viewWith(data);
    const originalPoles = canvas.quien.poles;
    const original = new Map(canvas.scene.targets);
    fireEvent.click(screen.getByRole('button', { name: 'Carla' }));
    expect(canvas.quien.clusters.find(cluster => cluster.id === 'me,b')?.keys).toEqual(['book:1', 'book:3']);
    expect(canvas.quien.clusters.find(cluster => cluster.id === 'me,b,c')).toBeUndefined();
    expect(canvas.quien.poles).toEqual(originalPoles);
    expect(canvas.scene.targets.get('book:1')).not.toEqual(original.get('book:1'));
    expect(canvas.scene.targets.get('book:4')).toEqual({ ...original.get('book:4'), alpha: 0.06 });
    fireEvent.click(screen.getByRole('button', { name: 'Bea' }));
    expect(canvas.quien.clusters.find(cluster => cluster.id === 'me')?.keys).toEqual(['book:1', 'book:3']);
    expect(canvas.scene.targets.get('book:2')).toEqual({ ...original.get('book:2'), alpha: 0.06 });
    fireEvent.click(screen.getByRole('button', { name: 'Carla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bea' }));
    expect([...canvas.scene.targets]).toEqual([...original]);
  });
  it('hover no recalcula los destinos de Quién si no cambia la selección', () => {
    view();
    const layout = canvas.quien, scene = canvas.scene;
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    expect(canvas.quien).toBe(layout);
    expect(canvas.scene).toBe(scene);
  });
  it('con una selección dada solo activa esas caras y avisa del cambio sin tocarla', () => {
    const onChosenChange = vi.fn();
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={snapshot} viewerId="me" groupId="g" chosen={['b', 'me']} onChosenChange={onChosenChange} lens="quien" onLensChange={vi.fn()} islandMode="type" onIslandModeChange={vi.fn()} list={false} onListChange={vi.fn()}/></NextIntlClientProvider>);
    expect(screen.getByRole('button', { name: 'Carla' }).getAttribute('aria-pressed')).toBe('false');
    expect(canvas.active).toEqual(['me', 'b']);
    fireEvent.click(screen.getByRole('button', { name: 'Tú' }));
    expect(onChosenChange).toHaveBeenCalledWith(['b']);
    expect(screen.getByRole('button', { name: 'Tú' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('si nadie de la selección sigue en el cruce, vuelven a estar todas las caras', () => {
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={snapshot} viewerId="me" groupId="g" chosen={['gone']} onChosenChange={vi.fn()} lens="quien" onLensChange={vi.fn()} islandMode="type" onIslandModeChange={vi.fn()} list={false} onListChange={vi.fn()}/></NextIntlClientProvider>);
    for (const name of ['Tú', 'Bea', 'Carla']) expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true');
    expect(summary()).toBe('1 obra en común entre Tú, Bea y Carla');
  });
  it('una cara de la selección que ya no está disponible se ignora: solo quedan las demás', () => {
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={snapshot} viewerId="me" groupId="g" chosen={['b', 'x']} onChosenChange={vi.fn()} lens="quien" onLensChange={vi.fn()} islandMode="type" onIslandModeChange={vi.fn()} list={false} onListChange={vi.fn()}/></NextIntlClientProvider>);
    expect(canvas.active).toEqual(['b']);
    expect(screen.getByRole('button', { name: 'Bea' }).getAttribute('aria-pressed')).toBe('true');
    for (const name of ['Tú', 'Carla']) expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
  });
  it('el hover no rehace la lista de caras activas que recibe el lienzo', () => {
    view();
    const before = canvas.active;
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    expect(screen.getByText('Proyecto Salvación')).toBeTruthy();
    expect(canvas.active).toBe(before);
  });
  it('la etiqueta del lienzo describe la lente y el resumen en texto plano', () => {
    view();
    expect(canvas.label).toBe('Mapa de obras compartidas. Quién. 1 obra en común entre Tú, Bea y Carla');
    fireEvent.click(screen.getByRole('button', { name: 'Carla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tú' }));
    expect(canvas.label).toBe('Mapa de obras compartidas. Quién. 2 obras de Bea. Suma a alguien para ver el cruce.');
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
    // Without a link, focus goes to «Cerrar».
    expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'Cerrar' }));
  });
  it('la hoja lleva el foco a «Abrir ficha», se cierra con Escape y devuelve el foco al lienzo', () => {
    view();
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    const sheet = screen.getByRole('dialog', { name: 'Proyecto Salvación' });
    expect(document.activeElement).toBe(within(sheet).getByRole('link', { name: 'Abrir ficha' }));
    expect(canvasFocus).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(canvasFocus).toHaveBeenCalledTimes(1);
  });
  it('Escape en otro diálogo fuera del escenario no cierra la hoja', () => {
    view();
    const other = document.createElement('dialog'); const inside = document.createElement('button');
    other.appendChild(inside); document.body.appendChild(other);
    try {
      act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
      inside.focus();
      fireEvent.keyDown(inside, { key: 'Escape' });
      expect(screen.getByRole('dialog', { name: 'Proyecto Salvación' })).toBeTruthy();
      expect(canvasFocus).not.toHaveBeenCalled();
    } finally { other.remove(); }
  });
  it('cambiar de lente con el foco en la hoja lo lleva al lienzo', () => {
    view();
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    fireEvent.keyDown(document.activeElement!, { key: '2' });
    expect(screen.queryByRole('dialog', { name: 'Proyecto Salvación' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Opinión' }).getAttribute('aria-pressed')).toBe('true');
    expect(canvasFocus).toHaveBeenCalledTimes(1);
  });
  it('«Cerrar» también devuelve el foco al lienzo', () => {
    view();
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(canvasFocus).toHaveBeenCalledTimes(1);
  });
  it('Opinión: el dock la activa, el resumen cuenta coincidencias y la mini-ficha pone a cada cual en su nota', () => {
    // me 9, Bea 9, Carla 4 → mean of others 6.5, diff 2.5 → neither agree nor clash
    viewRated({ me: 9, b: 9, c: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    expect(screen.getByRole('button', { name: 'Opinión' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Quién' }).getAttribute('aria-pressed')).toBe('false');
    expect(summary()).toBe('Coincidís en 0 y chocáis en 0 de 1 obra compartida');
    expect(canvas.label).toContain('Opinión');
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    // The hover tip is aria-hidden (mouse-only duplicate), hence `hidden: true`.
    expect(screen.getByRole('img', { name: 'Notas: Tú 9, Bea 9, Carla 4', hidden: true })).toBeTruthy();
  });
  it('Opinión: la hoja táctil también pone la escala, y nombra a quien no puntuó', () => {
    viewRated({ me: 9, b: 9 });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    expect(screen.getByRole('img', { name: 'Notas: Tú 9, Bea 9, Carla sin nota' })).toBeTruthy();
  });
  it('Opinión: el lienzo recibe los textos del fondo con la referencia', () => {
    viewRated({ me: 9, b: 9, c: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    // The Y title is drawn rotated -90°: its trailing arrow ends up on top, pointing up (higher = liked more).
    expect(canvas.opinionLabels).toEqual({ axisRef: 'Tu nota →', axisOthers: 'Media de Bea y Carla →', loved: 'Os encantó', meh: 'Ni fu ni fa',
      refYes: 'Tú sí, el resto no', othersYes: 'El resto sí, tú no' });
    fireEvent.click(screen.getByRole('button', { name: 'Tú' }));
    // Bea is now the reference and Carla the only other face: the corners name her, no «el resto».
    expect(canvas.opinionLabels).toEqual({ axisRef: 'Nota de Bea →', axisOthers: 'Nota de Carla →', loved: 'Os encantó', meh: 'Ni fu ni fa',
      refYes: 'Bea sí, Carla no', othersYes: 'Carla sí, Bea no' });
  });
  it('Opinión: con Tú y una sola cara más, los textos nombran a esa persona', () => {
    viewRated({ me: 9, b: 9, c: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    fireEvent.click(screen.getByRole('button', { name: 'Carla' }));
    expect(canvas.opinionLabels).toEqual({ axisRef: 'Tu nota →', axisOthers: 'Nota de Bea →', loved: 'Os encantó', meh: 'Ni fu ni fa',
      refYes: 'Tú sí, Bea no', othersYes: 'Bea sí, tú no' });
  });
  it('Opinión: sin Tú y con dos caras más, la media las nombra y las esquinas hablan del resto', () => {
    const four = ['me', 'b', 'c', 'd'];
    const names: Record<string, string> = { me: 'Tú', b: 'Bea', c: 'Carla', d: 'Dani' };
    const big: Snapshot = { ...snapshot, group: { ...snapshot.group, members: four.map(id => member(id, names[id])) },
      works: four.map(userId => ({ userId, key: 'book:1' as WorkKey, rating: 7, date: null, orderUnknown: false, progress: null })) };
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={big} viewerId="me" groupId="g" chosen={['b', 'c', 'd']} onChosenChange={vi.fn()} lens="opinion" onLensChange={vi.fn()} islandMode="type" onIslandModeChange={vi.fn()} list={false} onListChange={vi.fn()}/></NextIntlClientProvider>);
    expect(canvas.opinionLabels).toEqual({ axisRef: 'Nota de Bea →', axisOthers: 'Media de Carla y Dani →', loved: 'Os encantó', meh: 'Ni fu ni fa',
      refYes: 'Bea sí, el resto no', othersYes: 'El resto sí, Bea no' });
  });
  it('Opinión: con más de tres caras además de la referencia, la media cuenta personas', () => {
    const ids = ['me', 'b', 'c', 'd', 'e'];
    const big: Snapshot = { ...snapshot, group: { ...snapshot.group, members: ids.map(id => member(id, id === 'me' ? 'Tú' : id.toUpperCase())) },
      works: ids.map(userId => ({ userId, key: 'book:1' as WorkKey, rating: 7, date: null, orderUnknown: false, progress: null })) };
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={big} viewerId="me" groupId="g" chosen={null} onChosenChange={vi.fn()} lens="opinion" onLensChange={vi.fn()} islandMode="type" onIslandModeChange={vi.fn()} list={false} onListChange={vi.fn()}/></NextIntlClientProvider>);
    expect(canvas.opinionLabels?.axisOthers).toBe('Media de 4 personas →');
    expect(canvas.opinionLabels?.refYes).toBe('Tú sí, el resto no');
  });
  it('la mini-ficha solo lista a las caras activas, en cualquier lente', () => {
    viewRated({ me: 9, b: 9, c: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Carla' }));
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    const tip = screen.getByText('Proyecto Salvación').closest('[aria-hidden="true"]')!;
    expect([...tip.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Tú', 'Bea']);
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    expect(screen.getByRole('img', { name: 'Notas: Tú 9, Bea 9' })).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).not.toContain('Carla');
  });
  it('la mini-ficha y la hoja enseñan la portada; sin portada o si falla, el bloque de color del tipo', () => {
    const withCover: Snapshot = { ...snapshot, catalog: [{ ...snapshot.catalog[0], coverUrl: 'https://covers.openlibrary.org/b/id/42-M.jpg' }] };
    viewWith(withCover);
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    const tip = screen.getByText('Proyecto Salvación').closest('[aria-hidden="true"]')!;
    const img = tip.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://covers.openlibrary.org/b/id/42-S.jpg');
    expect(img.getAttribute('alt')).toBe('');
    fireEvent.error(img);
    expect(screen.getByText('Proyecto Salvación').closest('[aria-hidden="true"]')!.querySelector('img')).toBeNull();
    act(() => canvas.onHover(null));
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    expect(screen.getByRole('dialog').querySelector('img')).toBeTruthy();
    cleanup();
    view();
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    expect(screen.getByText('Proyecto Salvación').closest('[aria-hidden="true"]')!.querySelector('img')).toBeNull();
  });
  it('Opinión con una sola cara pide otra', () => {
    viewRated({ me: 9, b: 9, c: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bea' })); fireEvent.click(screen.getByRole('button', { name: 'Carla' }));
    expect(summary()).toBe('Elige al menos a dos personas para comparar notas.');
  });
  it('Opinión sin obras con nota de la referencia y de otra cara lo dice', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    expect(summary()).toBe('Aún no hay obras con tu nota y la de alguien más.');
  });
  it('Opinión sin Tú usa la primera cara como referencia y lo dice', () => {
    viewRated({ me: 9, b: 9, c: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tú' }));
    expect(summary()).toBe('Coincidís en 0 y chocáis en 1 de 1 obra compartida, con Bea como referencia');
  });
  it('la mini-ficha se abre hacia arriba cuando el puntero está en la mitad baja del escenario', () => {
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    try {
      view();
      act(() => canvas.onHover({ key: 'book:1', x: 10, y: 550 }));
      const tip = screen.getByText('Proyecto Salvación').closest<HTMLElement>('[aria-hidden="true"]')!;
      expect(tip.style.bottom).toBe('calc(100% - 534px)');
      expect(tip.style.top).toBe('');
      act(() => canvas.onHover({ key: 'book:1', x: 10, y: 100 }));
      const high = screen.getByText('Proyecto Salvación').closest<HTMLElement>('[aria-hidden="true"]')!;
      expect(high.style.top).not.toBe('');
      expect(high.style.bottom).toBe('');
    } finally { height.mockRestore(); }
  });
  it('cambiar de lente cierra la hoja táctil abierta', () => {
    viewRated({ me: 9, b: 9, c: 4 });
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    expect(screen.getByRole('dialog', { name: 'Proyecto Salvación' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('de Opinión a Quién vuelven el pie, el resumen y la lista de dueños de la mini-ficha', () => {
    viewRated({ me: 9, b: 9, c: 4 });
    const caption = messages.comparisons.atlas.caption;
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    expect(screen.getByText(caption.opinion)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quién' }));
    expect(screen.getByText(caption.quien)).toBeTruthy();
    expect(screen.queryByText(caption.opinion)).toBeNull();
    expect(summary()).toBe('1 obra en común entre Tú, Bea y Carla');
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    expect(screen.queryByRole('img', { hidden: true })).toBeNull();
    const tip = screen.getByText('Proyecto Salvación').closest('[aria-hidden="true"]')!;
    expect([...tip.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Tú', 'Bea', 'Carla']);
  });
  it('el dock ofrece las cuatro lentes', () => {
    view();
    const lenses = screen.getByRole('group', { name: 'Lente' });
    expect([...lenses.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))).toEqual(['Quién', 'Opinión', 'Tiempo', 'Islas']);
    expect(screen.queryByRole('group', { name: 'Agrupar islas por' })).toBeNull();
  });
  it('Islas: aparece el grupo de modos y cambiar de modo cambia el resumen', () => {
    viewWith(withGenre);
    fireEvent.click(screen.getByRole('button', { name: 'Islas' }));
    const modes = screen.getByRole('group', { name: 'Agrupar islas por' });
    expect([...modes.querySelectorAll('button')].map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Tipo', 'true'], ['Género', 'false'], ['Autor/Director', 'false']]);
    expect(summary()).toBe('Donde más os parecéis: Libros, con 1 en común');
    expect(screen.getByText(messages.comparisons.atlas.caption.islas)).toBeTruthy();
    fireEvent.click(within(modes).getByRole('button', { name: 'Género' }));
    expect(within(modes).getByRole('button', { name: 'Género' }).getAttribute('aria-pressed')).toBe('true');
    expect(summary()).toBe('Donde más os parecéis: Ciencia ficción, con 1 en común');
    fireEvent.click(within(modes).getByRole('button', { name: 'Autor/Director' }));
    expect(summary()).toBe('Lo que tenéis en común (1) está en Otros: no tiene autor ni director en el catálogo');
  });
  it('Islas: cambiar de modo cierra la hoja táctil abierta', () => {
    viewWith(withGenre, 'islas');
    act(() => canvas.onActivate({ key: 'book:1', x: 10, y: 10 }, 'touch'));
    expect(screen.getByRole('dialog', { name: 'Proyecto Salvación' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Género' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('Islas con un formato concreto no ofrece Tipo y agrupa por Género', () => {
    viewWith({ ...withGenre, format: 'book' }, 'islas', 'type');
    const modes = screen.getByRole('group', { name: 'Agrupar islas por' });
    expect([...modes.querySelectorAll('button')].map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Género', 'true'], ['Autor/Director', 'false']]);
    expect(summary()).toBe('Donde más os parecéis: Ciencia ficción, con 1 en común');
  });
  it('Tiempo: la mini-ficha pone el año de cada dueño o dice que no tiene fecha', () => {
    viewWith({ ...snapshot, works: snapshot.works.map(work => work.key === 'book:1' && work.userId === 'me' ? { ...work, date: '2021-03-04' } : work) });
    fireEvent.click(screen.getByRole('button', { name: 'Tiempo' }));
    expect(screen.getByText(messages.comparisons.atlas.caption.tiempo)).toBeTruthy();
    expect(summary()).toBe('Ninguna obra compartida tiene fecha para todas las personas (1 sin fecha)');
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    const tip = screen.getByText('Proyecto Salvación').closest('[aria-hidden="true"]')!;
    expect([...tip.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Tú: 2021', 'Bea: sin fecha', 'Carla: sin fecha']);
    expect(screen.getByText('Tú: 2021')).toBeTruthy();
  });
  it('Tiempo: una fecha ilegible sale como sin fecha en la mini-ficha', () => {
    viewWith({ ...snapshot, works: snapshot.works.map(work => work.key === 'book:1' && work.userId === 'me' ? { ...work, date: 'nope' } : work) });
    fireEvent.click(screen.getByRole('button', { name: 'Tiempo' }));
    act(() => canvas.onHover({ key: 'book:1', x: 10, y: 10 }));
    const tip = screen.getByText('Proyecto Salvación').closest('[aria-hidden="true"]')!;
    expect([...tip.querySelectorAll('li')].map(li => li.textContent)[0]).toBe('Tú: sin fecha');
  });
  it('el lienzo recibe los textos de las islas', () => {
    view();
    const island = (id: string, label: string | null = null) => ({ id, label, x: 0, y: 0, r: 10, core: 0, keys: [], common: 0, shared: 0, means: [] }) as Island;
    expect(canvas.islandText?.title(island('other'))).toBe('Otros');
    expect(canvas.islandText?.title(island('book'))).toBe('Libros');
    expect(canvas.islandText?.title(island('g:Drama', 'Drama'))).toBe('Drama');
    expect(canvas.islandText?.common(3)).toBe('3 en común');
  });
  it('«Ver como lista» cambia el lienzo por la lista de obras y alterna aria-pressed', () => {
    view();
    const toggle = screen.getByRole('button', { name: 'Ver como lista' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Acercar' })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByTestId('canvas')).toBeNull();
    const list = screen.getByRole('region', { name: 'Lista de obras' });
    expect(within(list).getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/libro/1']);
    // Same name and text; the state is aria-pressed. Opening moves focus into the list; zoom goes away.
    expect(toggle.textContent).toBe('Ver como lista');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(list);
    expect(screen.queryByRole('button', { name: 'Acercar' })).toBeNull();
    // Summary, faces and lenses stay on top of the list.
    expect(summary()).toBe('1 obra en común entre Tú, Bea y Carla');
    expect(screen.getByRole('group', { name: 'Lente' })).toBeTruthy();
    // The map caption goes away over the list (it overlapped the rows) and comes back with the map.
    expect(screen.queryByText(messages.comparisons.atlas.caption.quien)).toBeNull();
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Lista de obras' })).toBeNull();
    expect(screen.getByText(messages.comparisons.atlas.caption.quien)).toBeTruthy();
  });
  it('la lista sigue a las caras: apagar a Bea quita lo que solo tiene ella', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    const list = () => screen.getByRole('region', { name: 'Lista de obras' });
    expect(within(list()).getByText('Obra sin información de catálogo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bea' }));
    expect(within(list()).queryByText('Obra sin información de catálogo')).toBeNull();
    expect(within(list()).getByRole('link', { name: /Proyecto Salvación/ })).toBeTruthy();
  });
  it('la lista sigue a la lente: en Opinión ordena por diferencia', () => {
    const two: Snapshot = { ...snapshot, catalog: [...snapshot.catalog, { key: 'book:3', title: 'Solaris', coverUrl: null, genres: [], creators: [] }],
      works: [['me', 'book:1', 9], ['b', 'book:1', 8], ['me', 'book:3', 9], ['b', 'book:3', 2]]
        .map(([userId, key, rating]) => ({ userId: userId as string, key: key as WorkKey, rating: rating as number, date: null, orderUnknown: false, progress: null })) };
    viewWith(two, 'opinion');
    fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    const list = screen.getByRole('region', { name: 'Lista de obras' });
    expect(within(list).getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/libro/3', '/libro/1']);
  });
  it('con la lista ya abierta, montar la vista (cambio de formato) no le roba el foco', () => {
    const outside = document.createElement('button'); document.body.appendChild(outside); outside.focus();
    try {
      render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={snapshot} viewerId="me" groupId="g" chosen={null} onChosenChange={vi.fn()} lens="quien" onLensChange={vi.fn()}
        islandMode="type" onIslandModeChange={vi.fn()} list onListChange={vi.fn()}/></NextIntlClientProvider>);
      expect(screen.getByRole('region', { name: 'Lista de obras' })).toBeTruthy();
      expect(document.activeElement).toBe(outside);
    } finally { outside.remove(); }
  });
  it('ida y vuelta mapa → lista → mapa conserva la cámara asentada', () => {
    view();
    expect(canvas.initialCamera).toBeUndefined();
    act(() => canvas.onSettled!({ lens: 'quien', x: 5, y: 6, k: 2 }, true));
    fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    expect(canvas.initialCamera).toEqual({ x: 5, y: 6, k: 2 });
  });
  it('una cámara que nadie movió no se recuerda: al volver a montar (cambio de formato) el lienzo encaja', () => {
    const first = view();
    act(() => canvas.onSettled!({ lens: 'quien', x: 5, y: 6, k: 2 }, false));
    expect(readCamera()).toBeNull();
    first.unmount(); view();
    expect(canvas.initialCamera).toBeUndefined();
  });
  it('la cámara movida se restaura al volver a montar (vuelta desde la ficha); «Encajar» la olvida', () => {
    const first = view();
    act(() => canvas.onSettled!({ lens: 'quien', x: 5, y: 6, k: 2 }, true));
    first.unmount(); const second = view();
    expect(canvas.initialCamera).toEqual({ x: 5, y: 6, k: 2 });
    act(() => canvas.onSettled!({ lens: 'quien', x: 0, y: 0, k: 1 }, false));
    expect(readCamera()).toBeNull();
    second.unmount(); view();
    expect(canvas.initialCamera).toBeUndefined();
  });
  it('la cámara guardada solo se usa con la misma lente', () => {
    view();
    act(() => canvas.onSettled!({ lens: 'quien', x: 5, y: 6, k: 2 }, true));
    fireEvent.click(screen.getByRole('button', { name: 'Opinión' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
    expect(canvas.initialCamera).toBeUndefined();
  });
  it('si sessionStorage falla, el lienzo encaja (sin cámara inicial) y nada se rompe', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    try {
      view();
      expect(() => act(() => canvas.onSettled!({ lens: 'quien', x: 5, y: 6, k: 2 }, true))).not.toThrow();
      expect(canvas.initialCamera).toBeUndefined();
    } finally { getItem.mockRestore(); setItem.mockRestore(); }
  });
  it('guarda la cámara bajo la cuenta y el grupo que le da el explorer, no el del snapshot', () => {
    render(<NextIntlClientProvider locale="es" messages={messages}><AtlasView snapshot={snapshot} viewerId="me" groupId="from-explorer" chosen={null} onChosenChange={vi.fn()}
      lens="quien" onLensChange={vi.fn()} islandMode="type" onIslandModeChange={vi.fn()} list={false} onListChange={vi.fn()}/></NextIntlClientProvider>);
    act(() => canvas.onSettled!({ lens: 'quien', x: 5, y: 6, k: 2 }, true));
    expect(JSON.parse(sessionStorage.getItem('biblioshare:atlas:me:from-explorer')!).camera).toEqual({ lens: 'quien', x: 5, y: 6, k: 2 });
    expect(sessionStorage.getItem('biblioshare:atlas:me:g')).toBeNull();
  });
  describe('teclado', () => {
    it('un dígito con el foco en una cara cambia la lente y no alterna la cara', () => {
      view();
      const bea = screen.getByRole('button', { name: 'Bea' });
      bea.focus();
      expect(fireEvent.keyDown(bea, { key: '3' })).toBe(false);
      expect(screen.getByRole('button', { name: 'Tiempo' }).getAttribute('aria-pressed')).toBe('true');
      expect(bea.getAttribute('aria-pressed')).toBe('true');
      expect(canvas.active).toEqual(['me', 'b', 'c']);
    });
    it('una tecla 2 con el foco en el lienzo pasa a Opinión; en un campo de texto no hace nada', () => {
      view(<input aria-label="Campo"/>);
      const field = screen.getByRole('textbox', { name: 'Campo' });
      expect(fireEvent.keyDown(field, { key: '2' })).toBe(true);
      expect(screen.getByRole('button', { name: 'Quién' }).getAttribute('aria-pressed')).toBe('true');
      expect(fireEvent.keyDown(screen.getByTestId('canvas'), { key: '2' })).toBe(false);
      expect(screen.getByRole('button', { name: 'Opinión' }).getAttribute('aria-pressed')).toBe('true');
    });
    it('+, -, 0 y flechas mueven la cámara por el lienzo; con modificadores no', () => {
      view();
      const target = screen.getByTestId('canvas');
      fireEvent.keyDown(target, { key: '+' });
      expect(handle.zoomBy).toHaveBeenCalledWith(1.4);
      fireEvent.keyDown(target, { key: '-' });
      expect(handle.zoomBy).toHaveBeenLastCalledWith(1 / 1.4);
      fireEvent.keyDown(target, { key: 'F' });
      expect(handle.fit).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(target, { key: 'ArrowDown' });
      expect(handle.panBy).toHaveBeenCalledWith(0, 80);
      expect(fireEvent.keyDown(target, { key: '+', ctrlKey: true })).toBe(true);
      expect(handle.zoomBy).toHaveBeenCalledTimes(2);
    });
    it('con la lista abierta las flechas desplazan la lista, no la cámara; las lentes siguen', () => {
      view();
      fireEvent.click(screen.getByRole('button', { name: 'Ver como lista' }));
      const list = screen.getByRole('region', { name: 'Lista de obras' });
      expect(fireEvent.keyDown(list, { key: 'ArrowDown' })).toBe(true);
      expect(handle.panBy).not.toHaveBeenCalled();
      fireEvent.keyDown(list, { key: '4' });
      expect(screen.getByRole('button', { name: 'Islas' }).getAttribute('aria-pressed')).toBe('true');
    });
  });
});
