# Optional AiRA Gemini voice coach

Voice is a trusted local adapter outside declarative OpenUI. Text and Mock require no voice credentials.

## Local setup

Set `GEMINI_API_KEY` in ignored local `.env`, then restart the app. Open **Talk to AiRA**, grant explicit audio/context sharing and API usage consent, and connect. Opening the panel never requests microphone access. The fixed model is `gemini-3.8-live`; the official `@google/genai` SDK is bundled locally. OpenAI credentials apply only to the separate text provider.

The long-lived Gemini key stays on the server. `POST /api/voice/token` checks local host/origin, the local request token and consent before issuing a one-use ephemeral token. The full Live configuration is constrained: model, audio, transcripts, voice, activity detection, instructions and workout tool. All fields are locked by the SDK default; no partial field mask is supplied. New connections must start within one minute; sessions last at most ten minutes. Keys, tokens and transcripts are excluded from exports.

## Audio and lifecycle

`src/web/gemini-live-client.ts` owns the official SDK session. `gemini-audio.ts` and the local microphone AudioWorklet stream mono PCM16 with the actual input sample rate and schedule returned speech through Web Audio (normally 24 kHz). The client continuously processes audio, transcripts, interruptions, asynchronous function calls and cancellations. Function responses are sent explicitly with matching IDs; the SDK does not execute workout functions.

Speech onset and Gemini interruption events flush queued local playback. Mute disables microphone tracks and signals audio-stream end while retaining typed interaction. Stop, consent withdrawal, timeout, disconnection and page exit release microphone/audio resources. A late SDK connection is closed when it resolves after cancellation. Permission, connection and quota errors retain the workout and offer text or manual reconnect. Reconnection sends current local state. Optional transcripts are bounded in page memory.

## Workout authority

The sole tool is `workout_action`, accepting an explicit `action` and `difficulty` only for `set_difficulty`. Supported actions are pause, resume, repeat current block, skip, recovery, difficulty, end, advance, describe next and restart. Extra fields are rejected locally. The model cannot set timers, phase, animations, cues, code, DOM, URLs, filesystem or network capabilities directly.

`WorkoutSession.applyIntent()` is shared by text, voice and primary controls; the controller validates resulting state. Repeat resets the current exercise, or returns from recovery to the previous exercise. Ambiguous stop pauses; explicit end is terminal until restart. Difficulty affects upcoming blocks only. Finalized recognized transcripts and typed voice messages use the same action gateway; a matching subsequent tool returns the cached result without applying twice. Unknown phrasing can be interpreted by Gemini. Stale revisions and cancelled calls are rejected. More than four tool attempts in a user turn ends the voice connection safely to bound a provider retry loop.

Automatic VAD uses `START_OF_ACTIVITY_INTERRUPTS`. Local microphone energy cuts playback promptly, while server ACTIVITY_START/END and interrupted/turnComplete events govern turn handling. The Developer API's raw `type` and SDK-converted `voiceActivityType` are both recognized. Interruption stops every scheduled Web Audio source, clears the queue, cancels pending tools and fences remaining old-response audio until turnComplete. User activity has priority; transcripts do not guess speech activity. No second playback system or invented provider cancellation API is used.

## Verification

The previous Gemini implementation was checked with account-backed synthetic audio on October 9, 2026. Those checks used the earlier field-patch tool and are historical; they do not prove the revised command semantics. Current correction-pass verification is recorded in RELEASE.md.

Unit/server tests cover strict intent validation, natural phrases, shared text/voice state, repeat targets and timer reset, pause/end, future difficulty, recovery, stale actions, constrained tokens, consent and private errors. Browser checks use the actual bundled SDK with simulated microphone, WebSocket and audio devices, covering cancellation, late audio, duplicate tools, transcript/tool deduplication, failure cleanup, disabled credentials and completion. Simulated checks do not establish real microphone or speech quality.

Implementation follows Google’s official [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [ephemeral token guide](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities) and [Live API reference](https://ai.google.dev/api/live).
