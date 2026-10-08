# AiRA — a little momentum

AiRA is a fictional guided workout experience with a local animated 3D companion, state-aware text interaction, a large timer, session progress and a responsive coaching surface. It starts offline in Mock without credentials.

The session follows intro → check-in → warm-up → block 1 → recovery → adaptation → block 2 → recovery → block 3 → completion. Timed stages advance automatically. Use Pause, Next step or Restart, or type “easier”, “pause”, “resume” or “next”. Check-in and adaptation let you choose a gentle or steady pace. All exercise actions are simulated; no physical workout is required. Optional speech-to-speech voice uses gpt-realtime-2.1-mini with a browser microphone, realtime audio, interruption support and page-local transcripts. It is disabled until locally configured and explicitly connected.

A local browser harness derived from AiRA API and AiRA client code. Read the short assignment in [docs/EXERCISE.md](docs/EXERCISE.md).

## Run

Requires Node.js 22.18 or later and npm. From this directory:

```sh
npm ci --ignore-scripts
npm start
```

Open http://127.0.0.1:4319. Stop with Ctrl+C. Change `PORT` in a local `.env` if needed.

The primary offline coach uses authored local session policy rather than a model. **Session settings** contains optional provider setup and usage consent. Configured live text receives a workout snapshot; only an accepted reply for the current coaching context may update the cue. Local session commands work in either mode. Live provider calls remain opt-in and have not been tested with real credentials.

**Developer tools → Load wiring sample** preserves the original fixture workflow: `/demo`, `next`, `back`, and `change value to 6`. It remains separate from workout progression. Prompt/skill edits load on the next model request; source changes need a restart and browser reload.

The original mascot is checked in at `src/web/assets/aira-trainer.glb` with eight animation clips. Three.js and GLTFLoader are bundled locally at build time. There are no runtime CDN, remote model, texture or font requests. `node scripts/create-trainer.mjs` regenerates the asset. See [session architecture](docs/WORKOUT-ARCHITECTURE.md) and [release scope](docs/RELEASE.md).

## Optional voice

Copy `.env.example` to `.env`, set `ALLOW_REALTIME_VOICE=true` and configure `OPENAI_API_KEY` locally. Restart `npm start`. Open **Voice**, agree to microphone/context sharing and API usage, then **Connect microphone**. This is independent of `ALLOW_LIVE_API` and the selected text runtime. Keep the key out of source, screenshots and exports.

Try “Make the next one easier”, “Repeat that”, “I need a recovery”, “What comes next?” or “Skip this block”. AiRA reads the same authoritative state used by the timer and mascot. Only validated `set_workout_state` requests can update it. Speak over a reply to interrupt; mute the microphone or stop voice at any time. While connected, the primary text box also sends messages to the voice coach. When disconnected, the original text workflow resumes. No credentials means no microphone request or API call.

Requires a microphone-capable WebRTC browser on localhost. If audio autoplay is blocked, choose **Enable coach audio**. Voice disconnects after ten minutes; you can reconnect. See [voice architecture and verification](docs/VOICE.md). Voice transcripts remain in page memory and are excluded from diagnostic exports.

## Files

- `skills/workout.md`: your interaction instructions.
- `prompts/`: output protocol and current-turn context.
- `src/shared/openui/`: parser, component registry, validation, navigation, timers and serialization.
- `src/web/`: browser renderers and presentation.
- `src/server/`: prompt loading, local HTTP server, mock and model adapters.
- `examples/wiring.openui`: generic offline fixture.

See [AiRA harness](docs/HARNESS.md) for the included plumbing and [runtime setup](docs/RUNTIMES.md) for optional model adapters.

## Check and package

```sh
npm run check
npx playwright install chromium
npm run test:ui
npm run package
```

The browser checks start a mock server on port 4320. To use an installed Chrome instead, set `PLAYWRIGHT_CHROME_PATH` to its absolute executable path.

Packaging writes `output/workout-source.zip` locally. It includes source and records changes against this starter's baseline; it excludes `.env`, dependencies, build output and repository history. It does not submit anything. Builder tools can export a local run; optional run JSON files can be placed in `runs/`. Keep credentials out of source and exports.

The supplied tests exercise local harness behavior with fake transports. Live OpenAI and Claude requests have not been verified. This browser slice is not the production AiRA application.
