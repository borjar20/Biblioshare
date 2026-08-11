// Rotación circular de "Sugerirme otro": del último elemento vuelve al
// primero. Con lista vacía devuelve 0 en vez de NaN (módulo por cero).
export function rotateIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current + 1) % length;
}
