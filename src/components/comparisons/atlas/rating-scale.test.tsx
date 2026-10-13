// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '../../../../messages/es.json';
import type { AtlasOwner, AtlasPerson } from '@/lib/comparisons/atlas/types';
import { RatingScale } from './rating-scale';

const person = (id: string, name: string): AtlasPerson => ({ id, name, avatarUrl: null, color: '#123456', isMe: id === 'me' });
const owner = (userId: string, rating: number): AtlasOwner => ({ userId, rating, date: null });
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
});
