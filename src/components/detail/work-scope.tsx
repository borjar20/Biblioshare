// src/components/detail/work-scope.tsx
import type { CSSProperties, ReactNode } from "react";
import { posterFont } from "./poster-font";
import styles from "./work-scope.module.css";

export function WorkScope({ hue, children }: { hue: number; children: ReactNode }) {
  return (
    <div
      data-testid="work-scope"
      className={`${styles.scope} ${posterFont.variable} w-full flex-1`}
      style={{ "--work-hue": hue } as CSSProperties}
    >
      {children}
    </div>
  );
}
