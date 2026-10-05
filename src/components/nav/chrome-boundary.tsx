import { Suspense, type ReactNode } from "react";
import { ChromeGate } from "./chrome-gate";

// La ruta puede suspender con Cache Components y necesita su límite externo.
// La sesión espera DENTRO del gate: así este se hidrata antes que las barras y
// puede retirarlas al navegar sin intentar hidratar su HTML con otra ruta (#1385).
export function ChromeBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <ChromeGate>
        <Suspense fallback={fallback}>{children}</Suspense>
      </ChromeGate>
    </Suspense>
  );
}
