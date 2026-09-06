import type { SVGProps } from "react";

export function Swords(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m4 3 4 1 12 15-2 2L5 7 4 3Zm16 0-4 1-5 6m-3 4-4 5 2 2 4-5M3 15l6 5m6-1 6-4" /></svg>;
}

export function Shield(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z" /></svg>;
}
