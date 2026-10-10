import type { Snapshot } from '@/lib/comparisons/types';

// Slot order belongs to the saved group, so selecting a pair never recolours it.
const colors = ['var(--accent)', 'var(--green)', 'var(--type-series)', 'var(--type-movie)', 'var(--gold)',
  'color-mix(in srgb, var(--accent) 65%, var(--type-series))',
  'color-mix(in srgb, var(--green) 65%, var(--gold))',
  'color-mix(in srgb, var(--type-series) 65%, var(--type-movie))',
  'color-mix(in srgb, var(--type-movie) 65%, var(--green))',
  'color-mix(in srgb, var(--gold) 65%, var(--accent))'];

export function personColor(snapshot: Snapshot, userId: string) {
  const index = snapshot.group.members.findIndex(member => member.userId === userId);
  return colors[Math.max(0, index) % colors.length];
}

export function personInk(snapshot: Snapshot, userId: string) {
  return `color-mix(in srgb, ${personColor(snapshot, userId)} 65%, var(--foreground))`;
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase();
}
