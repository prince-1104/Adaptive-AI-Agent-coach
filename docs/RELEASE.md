# Phase 1 MVP release

This repository contains AiRA's fictional ten-stage guided session, responsive coaching UI, local animated 3D companion, validated OpenUI components, canonical workout state, simulated timers and opt-in text provider adapters. The original fixture, cancellation/retry and export tools remain available under Session settings → Diagnostics & exports. It does not perform physical exercise or production integrations.

## Run and verify

Use Node.js 22.18 or later. Install with `npm ci --ignore-scripts`, then run `npm start` and open http://127.0.0.1:4319. Build assets are generated locally and are not committed. Keep credentials in `.env` or local environment configuration; never commit them.

Run `npm run check`, install Chromium with `npx playwright install chromium`, and run `npm run test:ui`. CI runs checks on Linux and Windows. ClaudeCLI is deliberately unsupported on Windows; tests verify that it is rejected before execution. Adapter lifecycle tests run on Linux/macOS. The symlink export test skips on Windows when the account lacks symlink privileges; credential checks still run.

## Tested release scope

Local verification uses Mock, Playwright with installed Microsoft Edge, fake API responses and fake CLI transports. Tests cover the full authored sequence, local GLB loading and animation state changes, pause/adaptation/reset, mobile layout, reduced motion and WebGL fallback. No live OpenAI or Claude model request has been verified. Optional Gemini Live voice is implemented in trusted local source and tested with synthetic microphone/WebSocket/audio transports; account-backed verification is recorded separately in VOICE.md. CI results are separate evidence and must be checked after pushing.

## Before public deployment

- Evaluate the authored coaching flow and workout skill with additional synthetic scenarios and permitted live model access.
- Choose the hosting platform and define authenticated user access, authorization and session isolation.
- Add a reviewed HTTPS origin/host configuration. The server currently binds to loopback and accepts only localhost origins; keep that restriction until a public access design exists.
- Add per-user usage limits, provider budget controls and operational monitoring before enabling shared model access.
- Define data retention and deletion for conversations and exports; currently state lives in the browser and exports are manual.
- Verify a configured model with explicit usage consent and permitted credentials before claiming live coaching support.

This phase prepares source control and automated verification. It does not deploy or expose the local server publicly.

## Final product-quality pass — October 9, 2026

The opening mobile view keeps Start on screen at 390 × 844, gives text input its own full-width row, and keeps diagnostics inside collapsed Session settings. Labels and focus indicators have stronger contrast; controls retain touch targets. The timer animates only when stages change; untimed check-in/adaptation show a quiet placeholder instead of resetting to an estimated session duration. Trainer loading/failure retains the requested canonical animation, and interrupted cross-fades account for all outgoing clips. Voice feedback appears in the main coach bar without repeated live-region announcements. Keyboard focus returns to a usable control after voice dismissal and workout completion. Double clicks and held activation keys cannot skip the primary session stages.

This pass verifies Mock/text progression, the complete adapted session, credential-disabled voice, simulated Gemini streaming/tools/errors, keyboard interaction, mobile sizing, reduced motion and trainer loading/failure. Required `npm run check` and `npm run test` each passed 61 tests with three existing Windows skips. `npm run test:ui` passed all 27 browser checks using Microsoft Edge. The account-backed Gemini speech, interruption and full-session check was performed in the preceding Gemini pass, documented in VOICE.md; this presentation pass did not repeat paid provider requests. Live OpenAI/Claude text remains unverified.

The final source archive is inspected for excluded environment files, credentials, dependencies and build caches, and includes the local trainer asset, dependency lockfile, source and setup documentation. It is a local source handoff, not a public deployment.

## Product, voice and trainer correction — October 9, 2026

The primary surface now emphasizes the current exercise, timer, coach and trainer; the ten-step outline is collapsed. A visible next-block duration comparison accompanies difficulty changes. Pause presents Resume and End; explicit end preserves partial progress and offers Start again. The original local human trainer has a cap, expressive eyes, gym outfit, articulated elbows/knees/ankles, ten state clips and eight exercise clips. Its mixer chooses movements from canonical state, including squat and alternating lunge demonstrations. No remote assets or extra OpenUI components were introduced.

The shared intent gateway makes repeat, pause, resume, recovery, skip, adaptation and end actual controller actions for both text and voice. Gemini now requests `workout_action`, rather than arbitrary workout field patches. Barge-in stops scheduled buffers, rejects late audio from the interrupted response, and cancels pending tools. Transcript/tool duplicates return the existing result. A real speech check exposed animation-only revisions rejecting in-flight actions; those cosmetic transitions now preserve the coaching revision. Repeated provider tool attempts are bounded, and a failed voice send cannot apply a typed action twice.

Account-backed verification used the configured local Gemini credential and authorized synthetic speech, with real SDK/network and Web Audio output. Sixteen spoken commands exercised start, easier, recovery, repeat from recovery, barge-in pause, resume, next-step questions, natural-language skip, repeat of Squats, completion and explicit end. All fifteen model tool responses succeeded. The interruption probe stopped nine scheduled buffers and received a server interruption event. The session reached complete/celebrate; a restarted session reached stopped/end; disconnected text returned to check-in. There were no browser errors. This full sequence injected PCM at the microphone AudioWorklet message boundary. A separate Edge synthetic-WAV capture check used the actual browser microphone and AudioWorklet: “Wait, stop” froze the timer, selected pause, and received “Okay, pausing here” speech/transcript. No physical exercise or real user recording was used.

Mock, credential-free text and disabled voice were tested in the browser suite, along with expired authorization, malformed playback, denied permissions, stale/cancelled tools, queued audio, duplicate actions, responsive layout and keyboard controls. Desktop/mobile screenshots were inspected locally. Live OpenAI/Claude text and physical microphone acoustics remain unverified. The earlier verification sections describe historical passes, not the current test totals.

The subsequent face-reference update matches the trainer to the supplied cream face, dark eyes and red cap. A transparent pixel head sticker replaces decorative stars in the header, coach identity/cues, trainer area, footer and loading fallback, and serves as the favicon. Voice feedback adds a listening/speaking halo around the same coach identity. All files are bundled locally; the server exposes only the fixed PNG and GLB assets.

Trainer rendering is capped at 30 frames per second, with bounded pixel density and a soft 512px shadow map. Paused/reduced-motion views redraw only when presentation changes. This reduces software-renderer load without introducing another workout clock.

Final correction checks: `npm run check` passed 68 tests with three existing platform skips; `npm run test:ui` passed all 33 tests using Microsoft Edge. `npm run package` creates the source ZIP; its contents were inspected for environment files, permanent credentials, dependencies and build output, and both required local mascot assets were present. The face update retained the action/voice flow exercised by the account-backed synthetic checks above; it did not require another paid provider session.
