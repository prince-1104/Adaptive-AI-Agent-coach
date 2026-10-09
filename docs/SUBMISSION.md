# Final source submission — October 10, 2026

The deliverable is `output/workout-source.zip`, with a `workout-starter/` root directory. It contains the complete local source project and a SHA-256 file manifest. `output/SHA256.txt` records the archive checksum. No credentials or provider tokens are included.

## What was built

AiRA is a fictional AI-guided workout studio with canonical controller-owned state, validated declarative OpenUI, local animated mascot, authored offline text coaching, and optional Gemini Live voice. Text and voice request validated local workout intents. All executable behavior remains trusted local TypeScript.

## Verification for this handoff

- `npm run check`: passed, 72 tests passed and 3 Windows/platform skips; type checking, safety lint and build passed.
- `npm run test:ui`: passed all 48 browser tests using installed Microsoft Edge on Windows. Tests covered offline/text progression, adaptation, local assets, responsive layouts, keyboard/reduced-motion/WebGL fallback, simulated Gemini voice, errors/reconnect and transcript deduplication.
- `npm run package`: generated the conventional source ZIP successfully.
- Standalone extraction: installed 82 packages with `npm ci --ignore-scripts` (audit reported zero vulnerabilities), then `npm run check` passed 72 tests with 3 skips from the extracted project.
- `npm start` from the extracted project ran on verification port 4327 without `.env`. Edge smoke verified local GLB, PNG, trainer/SDK bundles, mock text adaptation, warm-up animation and voice-disabled behavior with no browser errors.
- Archive inspection: 88 files, valid CRCs, unique safe paths, matching manifest hashes, all current local assets present, 18 GLB animation clips and no external model buffers/textures. `.env.example` secret placeholders were empty. Scans found no credential patterns or actual local credential values in the archive. Dependencies, repository history, caches, builds, logs and temporary live audio/scripts were excluded.
- Failures: no outstanding check or packaging failures. Three Windows/platform tests skipped as declared by the test suite. npm emitted a deprecation warning for a transitive dependency; installation completed successfully.
- Runtime modes in this packaging pass: Mock/offline, local text, API-disabled behavior and simulated Gemini microphone/WebSocket/audio events. No paid provider request was made for this packaging pass.
- Prior authorized Gemini checks completed live synthetic speech, multi-turn energetic check-in/warm-up, full reply playback and deliberate interruption. The intermittent user-reported disconnect was not reproduced. Real OpenAI and Claude text providers remain unverified.

## Setup from the archive

Extract, enter `workout-starter`, install Node.js 22.18 or later and run `npm ci --ignore-scripts`, then `npm start`. Open http://127.0.0.1:4319. No `.env` is required for Mock. For optional voice, copy `.env.example` to `.env`, enter a locally permitted Gemini key, restart, then agree to microphone/API consent in the UI. See README and VOICE.md for details.

Browser tests require an installed Playwright Chromium (`npx playwright install chromium`) or `PLAYWRIGHT_CHROME_PATH` pointing to installed Chrome/Edge. Run `npm run check` before `npm run test:ui` so browser assets exist.

## Remaining manual verification

Additional browsers/mobile devices, real microphone/acoustic conditions, accessibility assistive technology, provider billing/model access, real OpenAI/Claude requests, and public deployment remain outside verified scope. Workout data is page-local. This is a simulated local product, not a physical fitness assessment or deployed service.
