# Adaptive AI Agent Coach — Phase 1 MVP

Phase 1 establishes the local coaching UI harness: validated declarative OpenUI components, navigation, simulated timers, conversation state, run export, and opt-in provider adapters. It uses synthetic interactions and starts in Mock without credentials.

The authored coaching experience is still pending: `skills/workout.md` is a placeholder and Mock serves a generic wiring fixture. This release is a development foundation; it is not a public production service. Deployment comes in a later phase. See [release scope and deployment prerequisites](docs/RELEASE.md).

A local browser harness derived from AiRA API and AiRA client code. Read the short assignment in [docs/EXERCISE.md](docs/EXERCISE.md).

## Run

Requires Node.js 22.18 or later and npm. From this directory:

```sh
npm ci --ignore-scripts
npm start
```

Open http://127.0.0.1:4319. Stop with Ctrl+C. Change `PORT` in a local `.env` if needed.

The app starts in Mock and needs no account or key. **Load wiring sample** displays generic component examples. Mock accepts `/demo`, `next`, `back`, and `change value to 6`; it does not interpret the skill or arbitrary messages. Use your editor to change files. Prompt/skill edits load on the next request; source changes need a restart and browser reload.

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
