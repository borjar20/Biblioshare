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
import { layoutIslands, type Island, type IslandMode } from '@/lib/comparisons/atlas/islands';
import type { Lens } from '@/lib/comparisons/atlas/scene';
import { AtlasList } from './atlas-list';
import type { IslandText } from './paint-islas';

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
function show(lens: Lens, active = ['me', 'b'], listWorks = works, listPeople = people, words: IslandText = islandText, mode: IslandMode = 'type') {
  const layouts = { quien: layoutQuien(listPeople, listWorks), opinion: layoutOpinion(listPeople, listWorks, active),
    tiempo: layoutTiempo(listPeople, listWorks, active), islas: layoutIslands(listPeople, listWorks, active, mode) };
  return render(<NextIntlClientProvider locale="es" messages={messages}>
    <AtlasList lens={lens} people={listPeople} works={listWorks} active={active} layouts={layouts} islandText={words}/>
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
  it('Islas: todas las medias incluyen persona y muestra bajo el encabezado, también con diez caras', () => {
    const ten = Array.from({ length: 10 }, (_, i) => person(`p${i}`, `Persona ${i}`));
    const ratings = Object.fromEntries(ten.map((p, i) => [p.id, i === 0 ? 8.9 : 9]));
    const rated = [1, 2, 3].map(i => work(`book:${i}`, `Libro ${i}`, ratings));
    const words: IslandText = { ...islandText,
      ratingLabel: (name, mean, count) => `${name}: media ${mean.toFixed(1).replace('.', ',')} · ${count} notas` };
    show('islas', ten.map(p => p.id), rated, ten, words);
    const heading = within(region()).getByRole('heading', { name: 'book' });
    for (let i = 0; i < 10; i++) expect(within(heading.parentElement!).getByText(`Persona ${i}: media ${i === 0 ? '8,9' : '9,0'} · 3 notas`)).toBeTruthy();
    expect(within(region()).getAllByRole('link')).toHaveLength(3);
  });
  it('Islas: una persona con menos de tres notas no recibe una media inventada', () => {
    show('islas', ['me', 'b'], [work('book:1', 'Uno', { me: 9, b: 8 }), work('book:2', 'Dos', { me: 9, b: null }), work('book:3', 'Tres', { me: 9, b: null })], people,
      { ...islandText, ratingLabel: (name, _mean, count) => `${name}: ${count} notas` });
    expect(within(region()).getByText('Tú: 3 notas')).toBeTruthy();
    expect(within(region()).queryByText(/Bea:.*notas/)).toBeNull();
  });
  it('Islas: explica Otros bajo su encabezado sin repetir la descripción en islas identificadas', () => {
    const explanation = '1 obra sin autor/director identificado';
    const words: IslandText = { ...islandText, description: island => island.id === 'other' ? explanation : '' };
    show('islas', ['me', 'b'], [work('book:1', 'Sin crédito', { me: 9, b: 8 }),
      work('book:2', 'Con crédito', { me: 9, b: 8 }, { creators: [{ id: 'a', name: 'Autora', role: 'author' }] })], people, words, 'creator');
    const heading = within(region()).getByRole('heading', { name: 'Otros' });
    expect(heading.nextElementSibling?.textContent).toBe(explanation);
    expect(within(region()).getAllByText(explanation)).toHaveLength(1);
    expect(within(region()).getByRole('heading', { name: 'Autora' }).nextElementSibling?.textContent).not.toBe(explanation);
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
