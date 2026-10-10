# Vercel deployment

AiRA can host its frontend and API in one Vercel project. The existing local `npm start` workflow remains available. No application redesign is required.

## Import and deploy

1. Import `prince-1104/Adaptive-AI-Agent-coach` from GitHub in Vercel.
2. Select framework **Other**, root directory **repository root**, Node.js **22.x**. Leave build/output overrides off: `vercel.json` sets install `npm ci --ignore-scripts`, build `npm run build:vercel`, output `public`.
3. Deploy without credentials first. Mock and typed workout commands are fully local. Visit the HTTPS deployment URL, start the workout, choose a pace, and verify recovery/adaptation and completion.
4. For a custom domain, set `APP_ORIGIN=https://your-domain.example` (no path/query). Vercel system variables supply the deployment, branch and production domains automatically; keep their exposure enabled. Redeploy after environment changes.

## Optional Gemini voice

Before enabling an account-backed demo, configure Vercel Deployment Protection for the production and preview environments that receive credentials, and set provider billing/usage limits. The application has no user accounts or shared global rate limiter. Its cookie protects requests against cross-site submission; it does not authenticate visitors. Each permitted visitor can spend your provider budget after agreeing to usage.

Set these **server-side** environment variables in Vercel for the intended environment, then redeploy:

| Variable | Value |
| --- | --- |
| `GEMINI_API_KEY` | Your private Gemini API key |
| `ALLOW_HOSTED_MODEL_API` | `true` |
| `APP_ORIGIN` | Custom HTTPS origin, if used |

Use a fresh private key and never commit it or give it a browser/public prefix. The existing exact `gemini-3.8-live` setting requires account/model availability and credits. The browser obtains a short-lived token from `/api/voice/token`, then connects directly to Google; audio does not pass through a persistent Vercel server. Microphone/API consent remains required. HTTPS, microphone permission and audio playback support are needed. Text remains available on voice failure.

Optional OpenAI live text additionally requires `OPENAI_API_KEY`, `ALLOW_LIVE_API=true` and the existing model setting. Real hosted OpenAI text is unverified. Local Claude CLI is disabled on Vercel.

## Build and request architecture

`npm run build:vercel` copies only browser code, shared declarative/controller code and local assets into generated `public/`. Server code, prompts and skills stay in private function bundles. Three thin entry points reuse the existing trusted API handler:

- `/api/config`
- `/api/turn`
- `/api/voice/token`

The hosted adapter validates exact Host/Origin values and uses a Secure, HttpOnly, SameSite=Strict host-only cookie plus request token across independent function instances. Workout state remains authoritative in trusted client source. No model-generated executable behavior is introduced. Functions have a 60-second configured duration; there is no server-held workout or voice session to preserve between invocations. Existing in-memory request concurrency limits apply per instance, not globally.

`public/` and `.vercel/` are ignored and excluded from source packaging. Required local GLB and sticker assets are copied into the static build and included in the source ZIP. `.env` is never a deployment input committed to Git; configure hosted secrets through Vercel instead.

## Verification and remaining deployment checks

Local type/lint/unit/HTTP tests and browser regressions are reported in the release notes. Hosted adapter tests use synthetic credentials and a fake token issuer, including cross-instance cookies, parsed request bodies, consent, disabled paid APIs and rejected foreign origins. These are not cloud deployment tests or real Gemini calls.

After the first deployment, manually verify `/api/config`, local text progression, mascot loading, mobile layout and voice-disabled feedback. After enabling protected voice, verify a full reply, interruption, mute/stop, transcript and workout adaptation on the actual HTTPS domain. Vercel bundling/routing, deployment access protection, custom-domain configuration, real microphone acoustics and account-backed hosted voice remain pending until that deployment is tested.

References: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [function configuration](https://vercel.com/docs/functions/configuring-functions/advanced-configuration), [Deployment Protection](https://vercel.com/docs/deployment-protection).
