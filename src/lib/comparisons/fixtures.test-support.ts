import type { PassRow, WatchRow } from './types';

export function pass(overrides: Partial<PassRow> = {}): PassRow {
  return {
    id: 'p', user_id: 'a', item_type: 'book', item_id: 'b',
    status: 'completed', is_active: true, rating: null,
    finished_on: '2026-01-01', created_at: '2026-01-01T12:00:00Z',
    ...overrides,
  };
}

export function watch(overrides: Partial<WatchRow> = {}): WatchRow {
  return {
    id: 'w', user_id: 'a', series_id: 's', pass_id: 'p',
    season_number: 1, episode_number: 1, rating: null,
    watched_on: '2026-01-01', created_at: '2026-01-01T12:00:00Z',
    ...overrides,
  };
}
