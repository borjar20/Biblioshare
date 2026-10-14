import { describe, expect, it } from 'vitest';
import { containsItem, coverSize, dotRadius, itemFrame, itemVisible } from './atlas-item-geometry';

describe('geometría de las obras del atlas', () => {
  it('los mínimos conservan la proporción de portada y el mayor tamaño de los puntos', () => {
    const normal = coverSize(0.61, false), opinion = coverSize(0.61, true);
    expect(normal.width).toBe(12); expect(opinion.width).toBe(12);
    expect(normal.height / normal.width).toBeCloseTo(12.2 / 8.4);
    expect(opinion.height / opinion.width).toBeCloseTo(1.45);
    expect(dotRadius(0.08, false, false, 0)).toBeCloseTo(2.1);
    expect(dotRadius(0.08, true, true, 0)).toBeCloseTo(4.2);
  });
  it('una portada no adelanta el umbral de Quién ni el de Islas aunque tenga un mínimo de tamaño', () => {
    for (const lens of ['quien', 'islas'] as const) {
      expect(itemFrame(lens, 1.1).coverMode).toBe(false);
      expect(itemFrame(lens, 1.11).coverMode).toBe(true);
    }
  });
  it('cubre las esquinas a zoom máximo y deja de acertar al superar el borde de la portada', () => {
    const size = coverSize(16, false);
    expect(containsItem(size.width / 2, size.height / 2, true, size, 0)).toBe(true);
    expect(containsItem(size.width / 2 + 0.1, 0, true, size, 0)).toBe(false);
    expect(containsItem(0, size.height / 2 + 0.1, true, size, 0)).toBe(false);
  });
  it('el mínimo táctil es rectangular para portadas y circular para puntos', () => {
    const size = coverSize(0.61, false);
    expect(containsItem(9, 9, true, size, 0)).toBe(true);
    expect(containsItem(9, 9, false, size, 2.1)).toBe(false);
    expect(containsItem(10, 0, false, size, 2.1)).toBe(true);
    expect(containsItem(10.1, 0, false, size, 2.1)).toBe(false);
  });
  it('el punto resaltado conserva su área completa aunque supere el mínimo táctil', () => {
    const radius = dotRadius(1.1, true, false, 1);
    expect(radius).toBeGreaterThan(10);
    expect(containsItem(radius, 0, false, coverSize(1.1, false), radius)).toBe(true);
  });
  it('el culling incluye una obra parcialmente visible desde cualquiera de los cuatro bordes', () => {
    const viewport = { width: 800, height: 600 }, { width, height } = coverSize(16, false);
    const halfWidth = width / 2, halfHeight = height / 2;
    for (const point of [[-halfWidth, 300], [800 + halfWidth, 300], [400, -halfHeight], [400, 600 + halfHeight]]) {
      expect(itemVisible(point[0], point[1], halfWidth, halfHeight, viewport)).toBe(true);
    }
    expect(itemVisible(-halfWidth - 0.1, 300, halfWidth, halfHeight, viewport)).toBe(false);
    expect(itemVisible(400, 600 + halfHeight + 0.1, halfWidth, halfHeight, viewport)).toBe(false);
  });
});
