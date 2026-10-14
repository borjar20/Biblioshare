// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '../../../../messages/es.json';
import type { WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { layoutOpinion } from '@/lib/comparisons/atlas/opinion';
import { layoutTiempo } from '@/lib/comparisons/atlas/tiempo';
import { layoutIslands, type Island } from '@/lib/comparisons/atlas/islands';
import type { Lens } from '@/lib/comparisons/atlas/scene';
import { AtlasList } from './atlas-list';

const person = (id: string, name: string, isMe = false): AtlasPerson => ({ id, name, avatarUrl: null, color: '#123456', isMe });
const people = [person('me', 'Tú', true), person('b', 'Bea')];
const work = (key: string, title: string, ratings: Record<string, number | null>, extra: Partial<AtlasWork> = {}, dates: Record<string, string> = {}): AtlasWork => ({
  key: key as WorkKey, itemType: key.startsWith('movie') ? 'movie' : 'book', itemId: key.split(':')[1], title, metadataMissing: false,
  coverUrl: null, genres: [], creators: [], owners: Object.entries(ratings).map(([userId, rating]) => ({ userId, rating, date: dates[userId] ?? null })), ...extra });
const works = [
  work('book:1', 'Dune', { me: 9, b: 2 }, { coverUrl: 'https://covers.openlibrary.org/b/id/42-M.jpg' }, { me: '2021-05-01', b: '2019-02-02' }),
  work('book:2', 'Solaris', { me: 7, b: 6 }),
  work('book:3', '', { b: 5 }, { metadataMissing: true }),
];
const islandText = { title: (island: Island) => island.id === 'other' ? 'Otros' : island.label ?? island.id, common: (count: number) => `${count} en común` };
function show(lens: Lens, active = ['me', 'b']) {
  const layouts = { quien: layoutQuien(people, works), opinion: layoutOpinion(people, works, active),
    tiempo: layoutTiempo(people, works, active), islas: layoutIslands(people, works, active, 'type') };
  return render(<NextIntlClientProvider locale="es" messages={messages}>
    <AtlasList lens={lens} people={people} works={works} active={active} layouts={layouts} islandText={islandText}/>
  </NextIntlClientProvider>);
}
afterEach(cleanup);
const region = () => screen.getByRole('region', { name: 'Lista de obras' });
const titles = () => within(region()).getAllByRole('listitem').map(item => item.querySelector('[data-title]')?.textContent);

describe('AtlasList', () => {
  it('Quién: un encabezado por grupo de dueños y enlaces a la ficha con portada decorativa', () => {
    show('quien');
    expect(within(region()).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Tú y Bea', 'Bea']);
    const dune = within(region()).getByRole('link', { name: /Dune/ });
    expect(dune.getAttribute('href')).toBe('/libro/1');
    const img = dune.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toBe('https://covers.openlibrary.org/b/id/42-S.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(dune.textContent).toContain('Tú y Bea');
  });
  it('una obra sin metadatos no tiene enlace', () => {
    show('quien');
    const missing = within(region()).getByText('Obra sin información de catálogo');
    expect(missing.closest('a')).toBeNull();
    expect(within(region()).getAllByRole('link')).toHaveLength(2);
  });
  it('apagar una cara quita sus obras y su nombre de encabezados y dueños', () => {
    show('quien', ['me']);
    expect(titles()).toEqual(['Dune', 'Solaris']);
    expect(within(region()).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Tú']);
    expect(within(region()).getByRole('link', { name: /Dune/ }).textContent).not.toContain('Bea');
    expect(screen.queryByText('Obra sin información de catálogo')).toBeNull();
  });
  it('Opinión: por diferencia, con la nota de la referencia y la media del resto', () => {
    show('opinion');
    expect(within(region()).queryByRole('heading')).toBeNull();
    expect(titles()).toEqual(['Dune', 'Solaris']);
    expect(within(region()).getByRole('link', { name: /Dune/ }).textContent).toContain('Tú 9 · media del resto 2.0');
  });
  it('Tiempo: el año de la primera aparición', () => {
    show('tiempo');
    expect(titles()).toEqual(['Dune']);
    expect(within(region()).getByRole('link', { name: /Dune/ }).textContent).toContain('2019');
  });
  it('Islas: el título de cada isla como encabezado', () => {
    show('islas');
    expect(within(region()).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['book']);
  });
  it('sin obras lo dice', () => {
    show('opinion', ['me']);
    expect(within(region()).getByText('No hay obras que mostrar con estas caras.')).toBeTruthy();
  });
  it('la región se alcanza con Tab', () => {
    show('quien');
    expect(region().getAttribute('tabindex')).toBe('0');
  });
  it('empieza por debajo del degradado del resumen y termina sobre el dock', () => {
    const active = ['me', 'b'];
    const layouts = { quien: layoutQuien(people, works), opinion: layoutOpinion(people, works, active),
      tiempo: layoutTiempo(people, works, active), islas: layoutIslands(people, works, active, 'type') };
    render(<NextIntlClientProvider locale="es" messages={messages}>
      <AtlasList lens="quien" people={people} works={works} active={active} layouts={layouts} islandText={islandText} insets={{ top: 100, bottom: 150 }}/>
    </NextIntlClientProvider>);
    expect(region().style.paddingTop).toBe('132px');
    expect(region().style.paddingBottom).toBe('150px');
  });
});
