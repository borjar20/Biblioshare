import type { CapacitorConfig } from "@capacitor/cli";

// The wrapper loads the deployed Next.js app over HTTPS instead of bundling
// static assets — SSR and Server Actions keep working exactly as they do on
// the web. See docs/REQUIREMENTS.md §8-F / §7.31 for the reasoning.
//
// `server.url` points at the real Vercel production deployment. To test
// against the local dev server instead, temporarily swap it for
// "http://10.0.2.2:3000" (the Android emulator's host-loopback alias) and
// add `cleartext: true` for the plain-HTTP local server.
const config: CapacitorConfig = {
  appId: "app.biblioshare.mobile",
  appName: "Biblioshare",
  webDir: "public",
  server: {
    url: "https://biblioshare-nine.vercel.app",
  },
};

export default config;
