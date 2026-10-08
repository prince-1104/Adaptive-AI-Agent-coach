# Optional AiRA Gemini voice coach

Voice is a trusted local adapter outside declarative OpenUI. Text and Mock require no voice credentials.

## Local setup

Set `GEMINI_API_KEY` in ignored local `.env`, then restart the app. Open **Talk to AiRA**, grant explicit audio/context sharing and API usage consent, and connect. Opening the panel never requests microphone access. The fixed model is `gemini-3.8-live`; the official `@google/genai` SDK is bundled locally. OpenAI credentials apply only to the separate text provider.

The long-lived Gemini key stays on the server. `POST /api/voice/token` checks local host/origin, the local request token and consent before issuing a one-use ephemeral token. The full Live configuration is constrained: model, audio, transcripts, voice, activity detection, instructions and workout tool. All fields are locked by the SDK default; no partial field mask is supplied. New connections must start within one minute; sessions last at most ten minutes. Keys, tokens and transcripts are excluded from exports.

## Audio and lifecycle

`src/web/gemini-live-client.ts` owns the official SDK session. `gemini-audio.ts` and the local microphone AudioWorklet stream mono PCM16 with the actual input sample rate and schedule returned speech through Web Audio (normally 24 kHz). The client continuously processes audio, transcripts, interruptions, asynchronous function calls and cancellations. Function responses are sent explicitly with matching IDs; the SDK does not execute workout functions.

Speech onset and Gemini interruption events flush queued local playback. Mute disables microphone tracks and signals audio-stream end while retaining typed interaction. Stop, consent withdrawal, timeout, disconnection and page exit release microphone/audio resources. A late SDK connection is closed when it resolves after cancellation. Permission, connection and quota errors retain the workout and offer text or manual reconnect. Reconnection sends current local state. Optional transcripts are bounded in page memory.

## Workout authority

The sole tool is `set_workout_state`, accepting phase, difficulty, durationSeconds, trainerAnimation and coachCue. Instructions require sparse patches: pace feedback changes only difficulty, progression changes only phase, and repeat/next questions do not change state. Local policy supplies durations and animation for phase transitions. External difficulty labels `easy`, `steady`, `intense` map to canonical `easy`, `moderate`, `challenging`. Trusted validation rejects extra properties and invalid enums, durations or cues. No code, DOM actions, URLs, filesystem or network capabilities are exposed to the model.

`WorkoutSession.applyVoiceUpdate()` permits the current phase, authored next phase or safe recovery from warm-up/active work. Temporary recovery resumes the authored next stage. `WorkoutController.dispatchBatch()` validates the entire transaction before committing. Rejection preserves phase, timer and state. Duration changes retain elapsed time and pause; difficulty-only changes affect later blocks. Stale revisions, cancelled/duplicate calls and multiple updates per user turn cannot advance the workout. Text, timer, OpenUI and Trainer share canonical state.

## Verification

Unit/server tests cover consent, constrained token lifetime, private errors, PCM encoding, atomic updates, safe recovery, future difficulty and natural text/voice equivalence. Browser tests run the real bundled SDK with synthetic WebSocket, microphone and audio context: streaming, playback, transcripts, interruption, tool calls/cancellation, full workout completion, permission denial, cleanup, reconnection, disabled voice and private exports. These simulations do not establish real speech quality.

Account-backed Edge verification on October 9, 2026 accepted the configured local credential, created a constrained ephemeral token and opened Gemini Live. Synthetic microphone speech reached Google; a spoken reply and both transcripts returned. "Make the next one easier" updated canonical difficulty to easy. A full account-backed session also completed all ten stages through twelve paced synthetic speech commands. The browser injected PCM at the AudioWorklet message boundary while using real SDK/network and Web Audio output; the earlier microphone WAV smoke exercised actual capture. Timers were paused between commands to inspect state. Sparse tool patches kept pace feedback in the current block, retained repeat/next state and applied shortened future blocks. The final state reached 100% with celebrate animation. Google returned 208 audio chunks and 11 interruption events; mute/stop released the microphone tracks. No browser errors occurred. An earlier credential reached Google but its project had depleted credits; the client now shows a useful quota error and releases media. Synthetic audio is used; no real workout or user recording is submitted.

Required checks passed: `npm run check` (61 passed, three existing Windows skips) and `npm run test:ui` (23 passed). Manual credential-free text, Mock and voice-disabled checks also passed. The archive credential scanner passed with local keys excluded.

To verify real speech, test "Make the next one easier", "Repeat that", "I need a recovery", "What comes next" and "Skip this block". Check spoken replies/transcripts, timer and mascot changes, interruption, mute/stop, and reconnect without losing state. Repeat the full workout and retain text/Mock and missing-key checks.

Implementation follows Google’s official [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [ephemeral token guide](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities) and [Live API reference](https://ai.google.dev/api/live).
