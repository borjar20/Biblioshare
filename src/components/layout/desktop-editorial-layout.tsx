import type { ReactNode } from "react";

type DesktopEditorialLayoutProps = {
  header?: ReactNode;
  focus?: ReactNode;
  main: ReactNode;
  rail?: ReactNode;
  className?: string;
};

export function DesktopEditorialLayout({
  header,
  focus,
  main,
  rail,
  className = "",
}: DesktopEditorialLayoutProps) {
  return (
    <div
      data-editorial-layout
      className={`mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-5 py-6 lg:px-8 ${className}`}
    >
      {header}
      {focus}
      <div
        className={
          rail
            ? "mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8"
            : "mt-5"
        }
      >
        <main data-editorial-main>{main}</main>
        {rail ? (
          <aside
            data-editorial-rail
            className="hidden border-l border-border pl-6 lg:block"
          >
            {rail}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
