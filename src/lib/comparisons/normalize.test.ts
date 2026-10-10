import { describe, expect, it } from 'vitest';
import { commonEpisodes, normalize } from './normalize';
import { pass, watch } from './fixtures.test-support';

describe('normalize', () => {
  it('un último terminado sin nota no recupera el ocho anterior', () => {
    const facts = normalize([
      pass({ id: 'old', rating: 8, finished_on: '2026-01-01' }),
      pass({ id: 'new', rating: null, finished_on: '2026-02-01' }),
    ], [], []);
    expect(facts.works).toMatchObject([{ userId: 'a', key: 'book:b', rating: null }]);
    expect(facts.works).toHaveLength(1);
  });

  it.each([
    { name: 'dos terminados conservan el seis más reciente', history: [
      pass({ id: 'old', rating: 8, finished_on: '2026-01-01' }),
      pass({ id: 'new', rating: 6, finished_on: '2026-02-01' }),
    ], rating: 6, unknown: false },
    { name: 'un abandono posterior no sustituye la película terminada', history: [
      pass({ id: 'done', item_type: 'movie', rating: 8, finished_on: '2026-01-01' }),
      pass({ id: 'dropped', item_type: 'movie', status: 'dropped', rating: 2, finished_on: '2026-04-01' }),
    ], rating: 8, unknown: false },
    { name: 'una nueva lectura en curso no sustituye la última terminada', history: [
      pass({ id: 'done', rating: 8 }),
      pass({ id: 'reading', status: 'in_progress', rating: 2, finished_on: null }),
    ], rating: 8, unknown: false },
    { name: 'sin fechas, creación e id resuelven la elección pero el orden es incierto', history: [
      pass({ id: 'a', rating: 8, finished_on: null, created_at: '2026-01-01T00:00:00Z' }),
      pass({ id: 'z', rating: 6, finished_on: null, created_at: '2026-01-01T00:00:00Z' }),
    ], rating: 6, unknown: true },
    { name: 'fecha conocida gana sobre fecha ausente sin ocultar incertidumbre', history: [
      pass({ id: 'known', rating: 8, finished_on: '2026-01-01' }),
      pass({ id: 'unknown', rating: 6, finished_on: null, created_at: '2026-12-01T00:00:00Z' }),
    ], rating: 8, unknown: true },
  ])('$name', ({ history, rating, unknown }) => {
    expect(normalize(history, [], []).works).toMatchObject([{
      rating, orderUnknown: unknown, progress: null,
    }]);
  });

  it('un solo terminado sin fecha no marca el orden como incierto', () => {
    expect(normalize([pass({ finished_on: null })], [], []).works[0].orderUnknown).toBe(false);
  });

  it('solo incluye una obra por persona y clave, sin mezclar personas ni formatos', () => {
    const facts = normalize([
      pass({ id: 'a-book', rating: 8 }),
      pass({ id: 'b-book', user_id: 'b', rating: 4 }),
      pass({ id: 'a-movie', item_type: 'movie', rating: 6 }),
      pass({ id: 'a-planned', item_id: 'other', status: 'planned' }),
    ], [], []);
    expect(facts.works.map(({ userId, key, rating }) => ({ userId, key, rating }))).toEqual([
      { userId: 'a', key: 'book:b', rating: 8 },
      { userId: 'b', key: 'book:b', rating: 4 },
      { userId: 'a', key: 'movie:b', rating: 6 },
    ]);
  });

  it('serie une pases, deduplica episodios y toma progreso solo del pase activo', () => {
    const facts = normalize([
      pass({ id: 'closed', item_type: 'series', item_id: 's', is_active: false, rating: 8 }),
      pass({ id: 'active', item_type: 'series', item_id: 's', status: 'in_progress',
        is_active: true, rating: null, finished_on: null }),
    ], [
      watch({ id: 'old-1', pass_id: 'closed', episode_number: 1, rating: 8 }),
      watch({ id: 'old-2', pass_id: 'closed', episode_number: 2, rating: 7 }),
      watch({ id: 'new-2', pass_id: 'active', episode_number: 2, rating: null,
        watched_on: '2026-02-01' }),
      watch({ id: 'new-3', pass_id: 'active', episode_number: 3, rating: 9,
        watched_on: '2026-02-02' }),
    ], [{ seriesId: 's', count: 12 }]);
    expect(facts.works).toMatchObject([{ userId: 'a', key: 'series:s', rating: null,
      progress: { seenEver: 3, current: 2, aired: 12, status: 'in_progress' } }]);
    expect(facts.episodes['a|series:s']).toEqual([
      { season: 1, episode: 1, rating: 8 },
      { season: 1, episode: 2, rating: null },
      { season: 1, episode: 3, rating: 9 },
    ]);
  });

  it('un watch con pass_id nulo cuenta como visto pero no como progreso de un pase', () => {
    const facts = normalize([
      pass({ id: 'active', item_type: 'series', item_id: 's', status: 'in_progress' }),
    ], [watch({ pass_id: null, rating: 7 })], []);
    expect(facts.works[0].progress).toEqual({ seenEver: 1, current: 0, aired: null,
      status: 'in_progress' });
    expect(facts.episodes['a|series:s']).toEqual([{ season: 1, episode: 1, rating: 7 }]);
  });

  it('episodio huérfano sin pase general incluye la serie con progreso actual nulo', () => {
    const facts = normalize([], [watch({ pass_id: null, rating: 7 })], []);
    expect(facts.works).toEqual([{ userId: 'a', key: 'series:s', rating: null,
      orderUnknown: false,
      progress: { seenEver: 1, current: null, aired: null, status: null } }]);
  });

  it('una serie terminada sin episodios queda excluida y aumenta la cobertura faltante', () => {
    const facts = normalize([pass({ item_type: 'series', item_id: 's' })], [], []);
    expect(facts.works).toEqual([]);
    expect(facts.excludedSeriesWithoutEpisodes).toBe(1);
  });

  it('la nota del último visionado nulo no recupera la nota anterior', () => {
    const facts = normalize([], [
      watch({ id: 'old', rating: 8, watched_on: '2026-01-01' }),
      watch({ id: 'new', rating: null, watched_on: '2026-02-01' }),
    ], []);
    expect(facts.episodes['a|series:s']).toEqual([{ season: 1, episode: 1, rating: null }]);
    expect(facts.works[0].progress?.seenEver).toBe(1);
  });

  it('usa el activo en curso, y si falta el último cerrado, sin rescatar notas antiguas', () => {
    const watches = [watch({ pass_id: 'latest' })];
    const earlier = pass({ id: 'earlier', item_type: 'series', item_id: 's', rating: 8,
      is_active: false, finished_on: '2026-01-01' });
    const latest = pass({ id: 'latest', item_type: 'series', item_id: 's', rating: null,
      is_active: false, finished_on: '2026-02-01' });
    expect(normalize([earlier, latest], watches, []).works[0]).toMatchObject({
      rating: null, progress: { current: null, status: 'completed' },
    });
  });
});

describe('commonEpisodes', () => {
  it('en un trío solo devuelve episodios con notas de las tres personas', () => {
    const facts = normalize([], [
      watch({ id: 'a1', user_id: 'a', rating: 8 }),
      watch({ id: 'b1', user_id: 'b', rating: 7 }),
      watch({ id: 'c1', user_id: 'c', rating: 9 }),
      watch({ id: 'a2', user_id: 'a', episode_number: 2, rating: 8 }),
      watch({ id: 'b2', user_id: 'b', episode_number: 2, rating: 8 }),
      watch({ id: 'c2', user_id: 'c', episode_number: 2, rating: null }),
    ], []);
    expect(commonEpisodes(facts, 'series:s', ['a', 'b', 'c'])).toEqual([{
      season: 1, episode: 1,
      notes: [{ userId: 'a', rating: 8 }, { userId: 'b', rating: 7 },
        { userId: 'c', rating: 9 }],
    }]);
  });

  it('no muestra episodios ajenos a la obra activa', () => {
    const facts = normalize([], [watch({ rating: 8 })], []);
    expect(commonEpisodes(facts, 'series:other', ['a'])).toEqual([]);
  });
});
