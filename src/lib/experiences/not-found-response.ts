import { NextResponse } from "next/server";
import messages from "../../../messages/es.json";
/** Fixed content only: never distinguish a hidden ID from an unknown ID. */
export function experienceUnavailableResponse() {
  const copy=messages.experiences;
  return new NextResponse(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${copy.unavailableTitle} — Biblioshare</title><style>body{margin:0;background:#f3ece1;color:#2c2620;font:1rem/1.6 system-ui}main{max-width:32rem;margin:10vh auto;padding:1.5rem}h1{font-family:Georgia,serif;font-size:2rem;line-height:1.2}a{display:inline-flex;align-items:center;min-height:44px;padding:0 1rem;color:inherit;border:1px solid #2c2620;border-radius:.75rem}a:focus-visible{outline:3px solid #b0542f;outline-offset:3px}</style></head><body><main><p>404</p><h1>${copy.unavailableTitle}</h1><p>${copy.unavailableMessage}</p><a href="/experiencias">${copy.back}</a></main></body></html>`,{status:404,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
