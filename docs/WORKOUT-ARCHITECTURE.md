# AiRA workout state foundation

The existing harness owns transport lifecycle in `Conversation`, declarative screen data in `ScreenDocument`, generic navigation in `createRunNav`, and timer clocks in `TimerLedger`. None of these currently defines workout phases. The skill is a placeholder and Mock implements a generic wiring fixture.

## Architecture and ownership

`src/shared/workout/state.ts` defines the canonical immutable `WorkoutState` and its runtime validation. Duration and elapsed time use integer seconds, with a 3600-second limit matching the existing timer validator. Difficulty is easy, moderate or challenging. Progress is the current phase's simulated elapsed/duration ratio (0–1), not overall screen progress or physical completion. Untimed phases have no movement or duration; complete has progress 1. Paused and elapsed time live here too so future input adapters cannot maintain conflicting copies.

`src/shared/workout/controller.ts` owns state through validated, data-only actions. It exposes immutable snapshots and increasing revisions, validates phase transitions atomically, and derives progress. Reaching a timer's end never advances the phase automatically. Trusted application policy decides transitions. Reset invalidates captured revisions even when already at intro. Asynchronous adapters must capture a revision before work and supply it when dispatching; stale actions return false.

The initial graph is intro → checkin → warmup → active → recovery → complete. Warmup, active and recovery can enter adaptation; adaptation can return to warmup, active or recovery. Recovery can begin another active interval. Same-phase transitions and transitions from complete are rejected; reset begins a new run. Timed transitions require a movement label and positive duration. Adaptation changes difficulty or the current timed duration, preserving elapsed time and clamping it when shortened. Untimed adaptation/checkin accept difficulty changes with duration zero; the subsequent timed transition supplies its duration explicitly.

`Conversation` owns one `WorkoutController` per run and resets it with conversation/screens. Its existing request cancellation, retry, provider selection and response validation stay intact. Provider switching preserves workout state. The foundation does not interpret free text or OpenUI as workout actions, alter generic fixture behavior, or invoke a provider. It does not yet serialize workout state in HTTP requests or exports.

Future text interaction and optional realtime voice adapters should translate input into the same validated actions and read the same snapshot. Neither adapter owns a workout clock, phase graph or animation state. A future trusted timer adapter will translate the selected `TimerLedger` entry into elapsed actions (whole seconds) and pause actions. A future renderer will project the snapshot into registered, validated OpenUI components and trainer animation; visual animation callbacks must not advance phases. New model-facing declarative components require registry entries, prop validation, renderers and an atomic integration path before use.

## File boundaries

This step adds the two shared workout modules, focused controller tests, and this document; it changes only `src/shared/controller.ts` in existing runtime source. The parser, OpenUI registry/validation/serialization, navigation, timer ledger, browser files, server/provider files, contracts, prompts, skill, existing tests, dependencies and CI remain unchanged.

## Harness risks and deferred work

- The OpenUI cursor is presentation state. Mapping arbitrary screen indexes to workout phases would corrupt canonical state, especially on Back or document replacement.
- TimerLedger may contain several timers. A later integration must explicitly bind the active workout interval to one timer and coordinate duration changes/reset; no second clock is introduced here.
- Current transport objects reject extra fields. Sending workout snapshots or accepting declarative coaching proposals needs a coordinated schema/protocol change, not an unvalidated side channel.
- Conversation's existing generation guard protects screen responses. Future coaching adapters must additionally use workout revisions to reject replies overtaken by local progress/adaptation/reset.
- Model output stays declarative. The controller is trusted TypeScript, never executable instructions supplied by a model. Text parsing/coaching policy is deferred.
- Current prompts and safety lint prohibit microphone/audio APIs. Optional voice later requires explicit protocol, consent, credentials and trusted capability changes. No audio, voice transport, mascot asset or visual redesign is implemented in this step.

All actions and test scenarios are synthetic. Existing Mock functionality remains available without credentials. Live provider setup and usage consent requirements are unchanged.
