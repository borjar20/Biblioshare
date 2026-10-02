/* Local-only CI provider chain. Each fixture retains its own scope guards. */
/* eslint-disable @typescript-eslint/no-require-imports */
require('./detail-notes-provider.cjs');
require('./google-volume-quota-provider.cjs');
if (process.env.GOOGLE_VOLUME_HYDRATION_NAMESPACE || process.env.GOOGLE_VOLUME_HYDRATION_FIXTURES || process.env.GOOGLE_VOLUME_HYDRATION_LOG) {
  require('./google-volume-hydration-provider.cjs');
}
