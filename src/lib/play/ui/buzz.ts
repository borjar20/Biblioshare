// Vibración sutil al aterrizar. No-op donde no hay soporte (iOS Safari, SSR).
export function buzz(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
}
