import { describe, expect, it } from 'vitest';
import { atlasKeyAction } from './atlas-keys';

const none = { ctrl: false, meta: false, alt: false };
const on = (key: string, tag = 'CANVAS') => atlasKeyAction(key, none, tag);

describe('atlasKeyAction', () => {
  it('+ y = acercan; - y _ alejan', () => {
    expect(on('+')).toEqual({ kind: 'zoom', factor: 1.4 });
    expect(on('=')).toEqual({ kind: 'zoom', factor: 1.4 });
    expect(on('-')).toEqual({ kind: 'zoom', factor: 1 / 1.4 });
    expect(on('_')).toEqual({ kind: 'zoom', factor: 1 / 1.4 });
  });
  it('0, f y F encajan', () => {
    for (const key of ['0', 'f', 'F']) expect(on(key)).toEqual({ kind: 'fit' });
  });
  it('las flechas mueven 80 px hacia donde apuntan', () => {
    expect(on('ArrowLeft')).toEqual({ kind: 'pan', dx: -80, dy: 0 });
    expect(on('ArrowRight')).toEqual({ kind: 'pan', dx: 80, dy: 0 });
    expect(on('ArrowUp')).toEqual({ kind: 'pan', dx: 0, dy: -80 });
    expect(on('ArrowDown')).toEqual({ kind: 'pan', dx: 0, dy: 80 });
  });
  it('1–4 eligen la lente en el orden del dock', () => {
    expect(['1', '2', '3', '4'].map(key => on(key))).toEqual([
      { kind: 'lens', lens: 'quien' }, { kind: 'lens', lens: 'opinion' }, { kind: 'lens', lens: 'tiempo' }, { kind: 'lens', lens: 'islas' }]);
  });
  it('con ctrl, meta o alt no hace nada (atajos del navegador)', () => {
    expect(atlasKeyAction('+', { ...none, ctrl: true }, 'CANVAS')).toBeNull();
    expect(atlasKeyAction('0', { ...none, meta: true }, 'CANVAS')).toBeNull();
    expect(atlasKeyAction('2', { ...none, alt: true }, 'CANVAS')).toBeNull();
  });
  it('nunca intercepta campos de texto', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(on('2', tag)).toBeNull();
    expect(on('2', 'BUTTON')).toEqual({ kind: 'lens', lens: 'opinion' });
  });
  it('otras teclas no son atajos', () => {
    for (const key of ['a', '5', 'Enter', ' ', 'Escape', 'Tab']) expect(on(key)).toBeNull();
  });
});
