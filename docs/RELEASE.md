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

## Guided workout behavior repair — October 9, 2026

Tired check-in now selects an easy plan and ready pose instead of pausing an untimed screen. A struggle request applies one validated ease-and-recover intent, shortening the actual upcoming block even when the current pace is already easy. Recovery waits at zero until the user is ready. Affirmative continuation commits the authored adaptation/next-exercise transitions atomically, avoiding an extra conversational step. The same contextual interpretation serves typed input and finalized Gemini transcripts. Upcoming exercise context includes its effective duration. Completion counts timer-completed blocks; skipped blocks are excluded.

`npm run check` passed 70 checks with three existing Windows skips. All 36 browser checks passed using Microsoft Edge. The browser suite covers the user's exact text example and a simulated spoken check-in/adaptation/continuation, alongside the existing mock, accessibility, mobile, disabled-voice and duplicate-action checks.

A fresh account-backed Gemini check used authorized synthetic speech through the real SDK/network and local Web Audio output. “I'm a little tired. Keep it easy” selected easy/check-in/ready without pausing; start selected warm-up/demonstrate; “This is too difficult” entered recovery and shortened Squats from 42 to 28 seconds; “Yes, let's go” started Squats with its actual 28-second timer and active animation. Four model tool requests succeeded, speech played, and no browser errors occurred. Disconnecting voice and typing Pause preserved text control. This check injected synthetic PCM at the AudioWorklet message boundary, and did not assess physical microphone acoustics. Warm-up-to-block advancement in this focused live check used the local Next control. Full automatic timing and completion are verified by deterministic tests; no live OpenAI/Claude calls were made.

When Gemini voice is connected, automatic timer phase changes queue one short spoken cue. Playback and user speech take priority; stale cues are discarded, and narration cannot execute autonomous workout tools. This path is covered by simulated browser events.

A second account-backed synthetic run allowed the warm-up timer to finish naturally. Standing march began with the easy 32-second timer and active animation, and Gemini started its automatic “Keep your movements” cue before user barge-in. The following difficult/ready utterances again produced recovery and the actual 28-second Squats block; all four tool results succeeded with no browser errors.

## Dark studio UI/UX — October 9, 2026

The primary surface uses dark black/olive backgrounds, warm brown conversation accents, restrained lime controls, modern typography, and a three-column desktop layout. The conversation sits beside the trainer, with a prominent microphone entry card and state-driven listening/speaking feedback. Mobile stacks the session and coach surfaces and keeps voice in a thumb-reachable dock; focusing the text input releases the dock. Typed input and incremental voice transcripts share a bounded, page-local conversation display. Quick requests reuse the existing controller gateway, and terminal sessions disable them. Chat reset omits the controller's intermediate initialization cue. Canonical workout state, timing, declarative registry/validation and the local mascot assets remain intact.

`npm run check` passed 70 tests with three existing Windows skips. This presentation pass tests Mock/text, credential-disabled voice and simulated Gemini speech/events through the real bundled SDK; it does not repeat paid model requests. Prior live Gemini verification is documented above and is distinct from these UI checks. Live OpenAI/Claude text and physical microphone acoustics remain unverified.

All 38 browser checks passed in Microsoft Edge, including adjacent chat geometry, controller-backed quick requests, incremental transcript deduplication, mobile voice visibility, keyboard controls, mock progression, loading/failure states and disabled API behavior. Desktop and mobile previews were inspected. The refreshed source ZIP includes both local mascot assets and excludes local environment files, credentials, dependencies and build output.

## Complete voice replies — October 9, 2026

Passive context updates previously used Gemini ClientContent during active generation; that message type interrupts the current response even with turnComplete false. The adapter now coalesces updates until both provider generation and scheduled audio playback finish. Typed requests include fresh validated state in their realtime text payload. A local noise-floor-aware onset check rejects isolated microphone spikes (96ms sustained onset normally; 128ms during playback), while the provider uses lower start sensitivity. Confirmed local/server speech still interrupts promptly. Server speech-end releases the activity latch, and a temporary empty audio queue shows thinking while generation continues instead of permitting background context to cut off the remaining reply.

`npm run check` passed 71 tests with three existing Windows skips. Browser regressions cover multi-chunk completion, background noise/spikes, both generation/playback completion orders, provider activity-latch release, and deliberate barge-in, alongside the existing mock/text and disabled-voice checks.

An authorized account-backed synthetic check used real Gemini SDK/network and Web Audio playback. A two-sentence introduction completed across a local check-in transition: all 22 received chunks finished playback without a stop or server interruption. A subsequent next-exercise reply completed despite injected low-level noise and a brief high-level spike: cumulative totals were 46 received, 46 scheduled, and 46 naturally ended chunks, with zero stops or interruptions. Deliberate synthetic “Wait, stop” during another reply then stopped six queued buffers, received one provider interruption, paused the canonical session, and played the full acknowledgement. No browser errors occurred. Synthetic PCM was injected at the microphone AudioWorklet boundary; physical microphone acoustics were not assessed. No live OpenAI/Claude calls were made.

All 43 browser checks passed in Microsoft Edge. The refreshed source archive includes the trusted speech-onset module and required local mascot assets; environment files, credentials, dependencies and generated build files are excluded.
