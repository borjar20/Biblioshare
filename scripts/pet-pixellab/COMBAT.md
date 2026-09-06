# Combat export (R3)

Combat uses the existing eighteen PixelLab class characters in `east`, plus the two character IDs in `combat-characters.json` in `west`. The source remains the full PixelLab character; the export copies only `battle-*` rows into independent PNGs. Companion PNGs, generated metadata and hitboxes remain untouched.

The MCP helper reads the existing project configuration from `~/.claude.json` in memory. It never prints credentials or stores them in this repository. Run commands from the repository/worktree. PixelLab access requires the configured subscription; generation spends its allowance.

```sh
node scripts/pet-pixellab/mcp.mjs get_balance
node scripts/pet-pixellab/combat-generate.mjs
node scripts/pet-pixellab/combat-fetch-all.mjs
node scripts/pet-pixellab/combat-verify.mjs
```

Generation is resumable: each accepted animation group is written immediately to `combat-characters.json`; existing IDs are skipped. Full queues wait 45 seconds. Other errors stop safely. Do not erase IDs to retry: inspect the character/job first; a submitted job may still be processing. `combat-fetch-all` reports pending exports and regenerates metadata for complete sheets; rerun it after jobs finish. `combat-verify` requires all twenty complete sheets.

Eight frames are requested with `keep_first_frame:false` for exactly eight stored frames. Each pet has idle, attack, hurt, ko. Both enemies also have guard; Brote adds charge and Escarabajo adds vulnerable. Cells come from the source export, never a fixed assumption. PNG compression is lossless and hashes cache-bust the URLs.

Review the exported rows visually before accepting them. The first east attack pilot (young fighter) was inspected before expanding the batch. Downloaded full source sheets and contact material stay under ignored `.superpowers/brainstorm/2026-09-06-r3/`; only combat rows are shipped.

R3 completed batch: **170 generations measured** (3471 → 3301, after all jobs completed), 20 PNGs / 979158 bytes, 84 accepted animation rows. Includes three beetle rerolls, one adult ranger attack reroll, and a beetle upside-down state plus interpolated KO. The state announced 20–40 generations; its individual charge cannot be isolated from simultaneous jobs, so the total above is the verified spend. No purchased credits.

The KO target and group are recorded in `combat-poses.json`. Interpolation produced a rectangular source cell (92×84); the exporter preserves pixels and centers each frame with transparent padding to the square runtime cell. The companion remains unaffected. All full animation strips were visually inspected. Four boundary pixels in adult ranger hurt frame 7 are the white outgoing effect at the right edge; the character and bow are intact.

```sh
node scripts/pet-pixellab/combat-contact.mjs
```

Creates a global twenty-row contact sheet with middle/final frames of each animation under `.superpowers/brainstorm/2026-09-06-r3/combat-contact.png`.
