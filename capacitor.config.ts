import type { CapacitorConfig } from "@capacitor/cli";

// The wrapper loads the deployed Next.js app over HTTP(S) instead of bundling
// static assets — SSR and Server Actions keep working exactly as they do on
// the web. See docs/REQUIREMENTS.md §8-F / §7.31 for the reasoning.
//
// `server.url` below points at the local dev server via the Android
// emulator's host-loopback alias (10.0.2.2 == the machine's localhost from
// inside the emulator). Swap this for the real production URL once the app
// is deployed — this is a local-dev placeholder, not a production config.
const config: CapacitorConfig = {
  appId: "app.biblioshare.mobile",
  appName: "Biblioshare",
  webDir: "public",
  server: {
    url: "http://10.0.2.2:3000",
    cleartext: true,
  },
};

export default config;
