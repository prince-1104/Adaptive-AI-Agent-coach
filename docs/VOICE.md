# Optional AiRA voice coach

Voice is a trusted adapter outside the declarative OpenUI protocol. OpenUI component signatures, validation and model output restrictions are unchanged. The only microphone exception in safety lint is `src/web/voice.ts`.

## Local setup

Set `ALLOW_REALTIME_VOICE=true` and `OPENAI_API_KEY` in local `.env`. Restart the app. Open Voice, agree to microphone audio/workout context sharing and API usage, then connect. Selecting a text provider or opening Voice does not start a call. The default is voice disabled; Mock and text stay usable without credentials. The exact model is `gpt-realtime-2.1-mini`, with no model fallback. Input transcripts use `gpt-live-transcribe`; generated speech uses the built-in Marin voice.

## Boundaries and lifecycle

`src/server/voice.ts` combines the browser's SDP offer with a fixed session configuration and calls the Realtime API. The long-lived key never enters browser configuration, an ephemeral token, exports or provider error messages. Local host/origin checks, a per-server local token, explicit consent and an independent environment gate protect session creation. Calls have server-owned opaque handles, a fixed hangup endpoint and a ten-minute lifetime.

`src/web/voice.ts` owns microphone tracks, the WebRTC peer, remote audio and a data channel. Server VAD detects speech and interrupts replies; the local client also cancels/clears active output on interruption or typed input. WebRTC manages unplayed-audio truncation. Connection/permission failures release local media and retain text coaching. Stop closes local tracks immediately and requests remote hangup; failure to confirm remote closure is shown. Transcripts remain in bounded page memory, outside diagnostic run exports. They reset on page reload.

`src/shared/workout/voice.ts` defines the sole tool, `set_workout_state`. Its arguments may contain only phase, difficulty, durationSeconds, trainerAnimation and coachCue, with canonical enum/range/length validation. No code, media URLs, filesystem, network, DOM or timer capabilities are exposed. Tool strings are data; only trusted code runs. Unknown tools, stale coaching revisions, interrupted/cancelled responses and duplicate calls cannot update state. One update is permitted per user turn; tool confirmation is followed by a response with tools disabled.

`WorkoutSession.applyVoiceUpdate()` permits the current or authored next phase, plus recovery from the final active block before completion. Movement labels come from local policy. `WorkoutController.dispatchBatch()` validates the full transaction before committing or notifying. Invalid requests preserve the old stage, timer and state. Duration adjustments retain elapsed time and pause; difficulty alone changes subsequent blocks. Text, timer and Trainer all project the same canonical state. The temporary final recovery continues to authored completion.

## Verification

Automated checks cover field/capability rejection, atomic updates, phase guards, stale requests, timer/mascot coherence, future difficulty, final recovery/completion, local consent/authentication, fixed model/tool configuration and private provider errors. Browser tests use synthetic microphone/WebRTC transports for listening/thinking/speaking, interruption, transcripts, typed fallback, denied permission, late microphone cleanup and disabled voice. Existing text and Mock tests remain included. These checks do not establish live account access or speech quality.

Manual local browser smoke checks passed for text-only commands (start/easier), pause/resume controls, the Mock fixture and its timer, and the graceful voice-disabled panel. Unit/server checks passed with three existing Windows-specific CLI skips. The browser suite includes fake live text and fake voice transports; neither is an account-backed test.

Manual account-backed voice verification remains pending: usage was authorized, but local `.env` and credentials were not configured during this implementation. Do not report synthetic browser tests as live voice verification. To verify live: enter an active block, connect with consent, speak each example, verify the transcript and spoken reply, confirm the requested state/timer/mascot change, interrupt a spoken response, then mute/stop and confirm the microphone releases. Repeat in text-only/Mock and with voice disabled.

Implementation follows the official [WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc), [conversation and interruption guide](https://developers.openai.com/api/docs/guides/realtime-conversations), [model documentation](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini) and [hangup API](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup).
