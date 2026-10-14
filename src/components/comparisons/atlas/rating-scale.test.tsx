// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '../../../../messages/es.json';
import type { AtlasOwner, AtlasPerson } from '@/lib/comparisons/atlas/types';
import { RatingScale } from './rating-scale';

const person = (id: string, name: string): AtlasPerson => ({ id, name, avatarUrl: null, color: '#123456', isMe: id === 'me' });
const owner = (userId: string, rating: number | null): AtlasOwner => ({ userId, rating, date: null });
const people = [person('me', 'Tú'), person('b', 'Bea'), person('c', 'Carla')];
afterEach(cleanup);

describe('RatingScale', () => {
  it('la pista crece con la pila más alta y ninguna cara se sale por arriba', () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      <RatingScale people={people} owners={people.map(p => owner(p.id, 9))}/>
    </NextIntlClientProvider>);
    const track = screen.getByRole('img').firstElementChild as HTMLElement;
    const height = parseFloat(track.style.height);
    expect(height).toBeGreaterThanOrEqual(48);
    const dots = [...track.querySelectorAll('span')] as HTMLElement[];
    expect(dots).toHaveLength(3);
    for (const dot of dots) expect(parseFloat(dot.style.bottom) + 20).toBeLessThanOrEqual(height);
  });
  it('sin pilas la pista mantiene su alto mínimo de 40px', () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      <RatingScale people={people} owners={[owner('me', 9), owner('b', 3)]}/>
    </NextIntlClientProvider>);
    expect((screen.getByRole('img').firstElementChild as HTMLElement).style.height).toBe('40px');
  });
  it('los puntos y las cifras quedan dentro de la pista: la nota 10 no se sale por la derecha', () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      <RatingScale people={people} owners={[owner('me', 10), owner('b', 1)]}/>
    </NextIntlClientProvider>);
    const scale = screen.getByRole('img');
    const dots = [...(scale.firstElementChild as HTMLElement).querySelectorAll('span')] as HTMLElement[];
    expect(dots.map(dot => dot.style.left)).toEqual(['calc(10px + 1 * (100% - 20px))', 'calc(10px + 0 * (100% - 20px))']);
    const ticks = [...(scale.children[1] as HTMLElement).querySelectorAll('span')] as HTMLElement[];
    expect(ticks[2].style.left).toBe('calc(10px + 1 * (100% - 20px))');
  });
  it('enseña la nota de cada cual con cifras, no solo las iniciales', () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      <RatingScale people={people} owners={[owner('me', 6), owner('b', 4), owner('c', null)]}/>
    </NextIntlClientProvider>);
    const scale = screen.getByRole('img', { name: 'Notas: Tú 6, Bea 4, Carla sin nota' });
    expect([...scale.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Tú 6', 'Bea 4', 'Carla sin nota']);
  });
});
