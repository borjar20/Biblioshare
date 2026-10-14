import { describe, expect, it } from 'vitest';
import type { Snapshot, WorkKey } from '../types';
import { PERSON_COLORS, atlasModel } from './model';

const member = (id: string, name: string, available = true) => ({ slotId: id, userId: available ? id : null, name: available ? name : null, avatarUrl: null, available });
const work = (userId: string, key: WorkKey, rating: number | null = null, date: string | null = null) => ({ userId, key, rating, date, orderUnknown: false, progress: null });
const snapshot: Snapshot = {
  group: { id: 'g', name: 'G', revision: 1, members: [member('b', 'Bea'), member('me', 'Yo'), member('x', 'Gone', false), member('c', 'Carla')] },
  format: 'all', excludedSeriesWithoutEpisodes: 0,
  catalog: [
    { key: 'movie:2', title: 'Peli', coverUrl: null, genres: ['Drama'], creators: [] },
    { key: 'book:9', title: 'Libro', coverUrl: '/c.jpg', genres: [], creators: [] },
  ],
  works: [work('b', 'movie:2', 7, '2024-01-01'), work('me', 'movie:2', 9, null), work('c', 'book:9'), work('me', 'book:1')],
};

describe('atlasModel', () => {
  it('pone primero a quien mira, como «Tú», y salta los no disponibles', () => {
    const { people } = atlasModel(snapshot, 'me', 'Tú');
    expect(people.map(p => [p.id, p.name, p.isMe])).toEqual([['me', 'Tú', true], ['b', 'Bea', false], ['c', 'Carla', false]]);
    expect(people.map(p => p.color)).toEqual(PERSON_COLORS.slice(0, 3));
  });
  it('agrupa por obra, ordena por tipo e id y conserva nota y fecha por dueño', () => {
    const { works } = atlasModel(snapshot, 'me', 'Tú');
    expect(works.map(w => w.key)).toEqual(['book:1', 'book:9', 'movie:2']);
    expect(works[2]).toMatchObject({ itemType: 'movie', itemId: '2', title: 'Peli', genres: ['Drama'],
      owners: [{ userId: 'me', rating: 9, date: null }, { userId: 'b', rating: 7, date: '2024-01-01' }] });
  });
  it('marca sin metadatos la obra que no está en catálogo', () => {
    const { works } = atlasModel(snapshot, 'me', 'Tú');
    expect(works[0]).toMatchObject({ key: 'book:1', title: '', metadataMissing: true, coverUrl: null });
  });
  it('sin quien mira en el grupo, conserva el orden de slots', () => {
    const { people } = atlasModel(snapshot, 'zzz', 'Tú');
    expect(people.map(p => p.id)).toEqual(['b', 'me', 'c']);
    expect(people.every(p => !p.isMe)).toBe(true);
  });
});
