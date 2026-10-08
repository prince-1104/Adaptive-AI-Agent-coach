# Phase 1 MVP release

This repository contains the local foundation for Adaptive AI Agent Coach. It supports validated OpenUI data, trusted component renderers, navigation, simulated timers, cancellation/retry, state inspection, redacted run exports and optional provider adapters. It does not perform physical exercise or production integrations.

## Run and verify

Use Node.js 22.18 or later. Install with `npm ci --ignore-scripts`, then run `npm start` and open http://127.0.0.1:4319. Build assets are generated locally and are not committed. Keep credentials in `.env` or local environment configuration; never commit them.

Run `npm run check`, install Chromium with `npx playwright install chromium`, and run `npm run test:ui`. CI runs checks on Linux and Windows. ClaudeCLI is deliberately unsupported on Windows; tests verify that it is rejected before execution. Adapter lifecycle tests run on Linux/macOS. The symlink export test skips on Windows when the account lacks symlink privileges; credential checks still run.

## Tested release scope

Local verification uses Mock, Playwright with installed Microsoft Edge, fake API responses and fake CLI transports. No live OpenAI or Claude model request has been verified. CI results are separate evidence and must be checked after pushing.

## Before public deployment

- Author and evaluate the workout skill and coaching flow with synthetic scenarios.
- Choose the hosting platform and define authenticated user access, authorization and session isolation.
- Add a reviewed HTTPS origin/host configuration. The server currently binds to loopback and accepts only localhost origins; keep that restriction until a public access design exists.
- Add per-user usage limits, provider budget controls and operational monitoring before enabling shared model access.
- Define data retention and deletion for conversations and exports; currently state lives in the browser and exports are manual.
- Verify a configured model with explicit usage consent and permitted credentials before claiming live coaching support.

This phase prepares source control and automated verification. It does not deploy or expose the local server publicly.
