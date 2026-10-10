"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** El saludo hace variar el inicio del rail. Su scroll debe terminar dentro
 * del viewport incluso antes de que el sticky alcance la cabecera. */
export function HomeRail({ area, children, className }: {
  area: "personal" | "stats";
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const wide = window.matchMedia("(min-width: 1100px)");
    let frame = 0;
    function measure() {
      frame = 0;
      if (!element) return;
      if (!wide.matches) {
        element.style.removeProperty("--home-rail-height");
        return;
      }
      const height = Math.max(120, window.innerHeight - element.getBoundingClientRect().top - 16);
      element.style.setProperty("--home-rail-height", `${height}px`);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    wide.addEventListener("change", schedule);
    const observer = new ResizeObserver(schedule);
    const greeting = element.parentElement?.previousElementSibling;
    if (greeting) observer.observe(greeting);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      wide.removeEventListener("change", schedule);
    };
  }, []);
  return area === "stats"
    ? <aside ref={ref} data-area={area} className={className}>{children}</aside>
    : <div ref={ref as React.RefObject<HTMLDivElement | null>} data-area={area} className={className}>{children}</div>;
}
