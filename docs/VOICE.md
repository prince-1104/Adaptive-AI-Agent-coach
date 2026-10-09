# Optional AiRA Gemini voice coach

Voice is a trusted local adapter outside declarative OpenUI. Text and Mock require no voice credentials.

## Local setup

Set `GEMINI_API_KEY` in ignored local `.env`, then restart the app. Open **Talk to AiRA**, grant explicit audio/context sharing and API usage consent, and connect. Opening the panel never requests microphone access. The fixed model is `gemini-3.8-live`; the official `@google/genai` SDK is bundled locally. OpenAI credentials apply only to the separate text provider.

The long-lived Gemini key stays on the server. `POST /api/voice/token` checks local host/origin, the local request token and consent before issuing a one-use ephemeral token. The full Live configuration is constrained: model, audio, transcripts, voice, activity detection, instructions and workout tool. All fields are locked by the SDK default; no partial field mask is supplied. New connections must start within one minute; sessions last at most ten minutes. Keys, tokens and transcripts are excluded from exports.

## Audio and lifecycle

`src/web/gemini-live-client.ts` owns the official SDK session. `gemini-audio.ts` and the local microphone AudioWorklet stream mono PCM16 with the actual input sample rate and schedule returned speech through Web Audio (normally 24 kHz). The client continuously processes audio, transcripts, interruptions, asynchronous function calls and cancellations. Function responses are sent explicitly with matching IDs; the SDK does not execute workout functions.

Speech onset and Gemini interruption events flush queued local playback. Mute disables microphone tracks and signals audio-stream end while retaining typed interaction. Stop, consent withdrawal, timeout, disconnection and page exit release microphone/audio resources. A late SDK connection is closed when it resolves after cancellation. Permission, connection and quota errors retain the workout and offer text or manual reconnect. Reconnection sends current local state. Optional transcripts are bounded in page memory.

## Workout authority

The sole tool is `workout_action`, accepting an explicit `action` and `difficulty` only for `set_difficulty`. Supported actions are pause, resume, repeat current block, skip, recovery, ease-and-recover, difficulty, end, advance, describe next and restart. Extra fields are rejected locally. The model cannot set timers, phase, animations, cues, code, DOM, URLs, filesystem or network capabilities directly.

`WorkoutSession.applyIntent()` is shared by text, voice and primary controls; the controller validates resulting state. Repeat resets the current exercise, or returns from recovery to the previous exercise. Ambiguous stop pauses; explicit end is terminal until restart. Difficulty affects upcoming blocks only. Struggling uses the single ease_and_recover action: shorten the upcoming exercise and enter recovery. Tired check-in selects easy without pausing. Recovery waits for readiness; affirmative continuation moves directly to the next exercise. Finalized recognized transcripts and typed voice messages use the same action gateway; a matching subsequent tool returns the cached result without applying twice. Unknown phrasing can be interpreted by Gemini. Stale revisions and cancelled calls are rejected. More than four tool attempts in a user turn ends the voice connection safely to bound a provider retry loop.

Automatic VAD uses lower start sensitivity with `START_OF_ACTIVITY_INTERRUPTS`. A sustained local speech-onset check (96ms normally, 128ms during playback) rejects isolated noise spikes before cutting playback, while server ACTIVITY_START/END and interrupted/turnComplete events govern turn handling. The Developer API's raw `type` and SDK-converted `voiceActivityType` are both recognized. Interruption stops every scheduled Web Audio source, clears the queue, cancels pending tools and fences remaining old-response audio until turnComplete. User activity has priority; transcripts do not guess speech activity. No second playback system or invented provider cancellation API is used. Automatic timer transitions queue a brief cue through the same Live session; user speech and existing playback take priority. Stale cues are discarded and autonomous narration cannot execute workout tools.

## Verification

The previous Gemini implementation was checked with account-backed synthetic audio on October 9, 2026. Those checks used the earlier field-patch tool and are historical; they do not prove the revised command semantics. Current correction-pass verification is recorded in RELEASE.md.

Unit/server tests cover strict intent validation, natural phrases, shared text/voice state, repeat targets and timer reset, pause/end, future difficulty, recovery, stale actions, constrained tokens, consent and private errors. Browser checks use the actual bundled SDK with simulated microphone, WebSocket and audio devices, covering cancellation, late audio, duplicate tools, transcript/tool deduplication, failure cleanup, disabled credentials and completion. Simulated checks do not establish real microphone or speech quality.

Implementation follows Google’s official [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [ephemeral token guide](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities) and [Live API reference](https://ai.google.dev/api/live).

## Complete reply playback

Passive workout context updates are coalesced while the model is generating, the user is speaking, or scheduled audio buffers remain. They are sent only when the response is idle. Google's [ClientContent contract](https://ai.google.dev/api/live#BidiGenerateContentClientContent) says that these messages interrupt current generation, even when `turnComplete` is false; they must not be used as background updates during a reply. Typed requests carry their fresh validated context in the same realtime text message. Provider turn completion does not flush remaining audio, and the speaking indicator remains active until those buffers finish. Confirmed user speech and explicit stop retain interruption behavior. Server speech-end releases its activity latch so local silence fallback remains available.


The connection-error pass was verified with authorized live Gemini audio: four successive text-driven voice replies through energetic check-in and warm-up completed without disconnects, and the synthetic microphone interruption check passed. The reported intermittent disconnect was not reproduced. Simulated browser tests cover transport-error/close ordering, classified session limits, and reconnecting from the main voice box while retaining workout difficulty and phase. Connection failures are displayed in that box; a socket error briefly waits for the close reason instead of erasing it with an immediate client disconnect. Reconnect remains an explicit user action under the existing usage consent.
