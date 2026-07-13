// Next.js internals (next/navigation, next/image, next/link) reference
// process.env.* and process.platform/nextTick at module top level. Outside
// Next's own bundler (which inlines these via DefinePlugin) there is no
// `process` global in a browser preview, so evaluating those modules throws
// ReferenceError before any component renders. Must load before any other
// bundled module — see cfg.extraEntries ordering in .design-sync/config.json.
if (typeof globalThis.process === "undefined") {
  (globalThis as unknown as { process: unknown }).process = {
    env: {},
    platform: "browser",
    version: "",
    browser: true,
    nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(() => fn(...args), 0),
  };
}

export {};
