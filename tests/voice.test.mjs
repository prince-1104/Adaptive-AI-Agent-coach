import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutController } from '../dist/shared/workout/controller.js';
import { WorkoutSession } from '../dist/shared/workout/session.js';
import { isVoiceUpdate } from '../dist/shared/workout/voice.js';
import { GEMINI_LIVE_MODEL } from '../dist/server/gemini-live.js';
import { encodePcm, decodePcm } from '../dist/web/gemini-audio.js';
import { createApp, readConfig } from '../dist/server/app.js';

const active = () => { let now = 0; const workout = new WorkoutController(); const session = new WorkoutSession(workout, () => now); session.next(); session.next(); session.next(); return { workout, session, advance: seconds => { now += seconds * 1000; session.tick(); } }; };
test('voice can request an easier upcoming workout at intro without advancing or creating a timer', () => {
  const workout = new WorkoutController(); const session = new WorkoutSession(workout);
  assert(session.applyVoiceUpdate({ difficulty: 'easy' }, workout.coachingRevision).ok);
  assert.equal(workout.state.phase, 'intro'); assert.equal(workout.state.durationSeconds, 0); assert.equal(session.index, 0);
  session.next(); session.next(); assert.equal(workout.state.durationSeconds, 21);
});
test('voice field allowlist rejects capabilities, invalid numbers and unknown enums', () => {
  assert.equal(GEMINI_LIVE_MODEL, 'gemini-3.8-live');
  assert(isVoiceUpdate({ difficulty: 'easy', coachCue: 'A gentler pace.' }));
  for (const value of [{}, [], null, { durationSeconds: NaN }, { durationSeconds: 1.5 }, { durationSeconds: 3601 }, { phase: 'completion' }, { trainerAnimation: 'execute' }, { coachCue: '' }, { coachCue: 'x'.repeat(1201) }, { url: 'https://example.org' }, { code: 'document.body.remove()' }, { elapsedSeconds: 0 }]) assert.equal(isVoiceUpdate(value), false);
});
test('batch validation rejects every field atomically and notifies once on success', () => {
  let notifications = 0; const workout = new WorkoutController(() => notifications++);
  const before = workout.snapshot();
  assert.throws(() => workout.dispatchBatch([{ type: 'coach', coachCue: 'Valid cue', trainerAnimation: 'ready' }, { type: 'transition', phase: 'complete', movementLabel: null, durationSeconds: 0, coachCue: 'Invalid skip' }]));
  assert.deepEqual(workout.snapshot(), before); assert.equal(notifications, 0);
  workout.dispatchBatch([{ type: 'transition', phase: 'checkin', movementLabel: null, durationSeconds: 0, coachCue: 'Check in' }, { type: 'adapt', difficulty: 'easy', durationSeconds: 0 }]);
  assert.equal(notifications, 1); assert.equal(workout.state.difficulty, 'easy');
  assert.equal(workout.dispatchBatch([{ type: 'reset' }], 0), false);
});
test('voice requests share timer and mascot state; easier targets future blocks; stale requests fail', () => {
  const { workout, session, advance } = active(); advance(5);
  assert(session.applyVoiceUpdate({ difficulty: 'easy' }, workout.coachingRevision).ok);
  assert.equal(workout.state.durationSeconds, 45); advance(2); assert.equal(session.remaining, 38);
  const revision = workout.coachingRevision;
  assert(session.applyVoiceUpdate({ phase: 'recovery', coachCue: 'Take a moment.' }, revision).ok);
  assert.equal(session.index, 4); assert.equal(workout.state.trainerAnimation, 'recover'); assert.equal(session.remaining, 11);
  assert.equal(session.applyVoiceUpdate({ phase: 'adaptation' }, revision).ok, false);
  advance(12); assert.equal(workout.state.phase, 'adaptation'); session.next(); assert.equal(session.remaining, 42);
});
test('invalid transitions and partial patches preserve session index, timer and current state', () => {
  const { workout, session, advance } = active(); advance(3);
  const before = workout.snapshot(); const remaining = session.remaining;
  for (const update of [{ phase: 'complete' }, { phase: 'intro' }, { phase: 'recovery', durationSeconds: 0 }, { phase: 'recovery', coachCue: 'Recovery', trainerAnimation: 'unknown' }, { phase: 'recovery', url: 'https://example.org' }]) {
    assert.equal(session.applyVoiceUpdate(update, workout.coachingRevision).ok, false);
    assert.deepEqual(workout.snapshot(), before); assert.equal(session.index, 3); assert.equal(session.remaining, remaining);
  }
  advance(1); assert.equal(session.remaining, remaining - 1);
});
test('duration changes retain pause and elapsed; final recovery and completion remain authored', () => {
  const { workout, session, advance } = active(); advance(8); session.pause(true);
  assert(session.applyVoiceUpdate({ durationSeconds: 20 }, workout.coachingRevision).ok);
  assert.equal(session.remaining, 12); advance(5); assert.equal(session.remaining, 12);
  session.pause(false); advance(1); assert.equal(session.remaining, 11);
  while (session.index < 8) session.next();
  assert(session.applyVoiceUpdate({ phase: 'recovery' }, workout.coachingRevision).ok);
  assert.equal(workout.state.phase, 'recovery'); assert.equal(session.stage.phase, 'recovery'); advance(20);
  assert.equal(workout.state.phase, 'complete'); assert.equal(workout.state.trainerAnimation, 'celebrate');
  session.reset(); while (session.index < 8) session.next();
  assert(session.applyVoiceUpdate({ phase: 'complete', coachCue: 'Session complete.', trainerAnimation: 'celebrate' }, workout.coachingRevision).ok);
  assert.equal(workout.state.coachCue, 'Session complete.');
});


async function app(env = {}, issuer = async () => { throw new Error('No model requests expected'); }) {
  const server = createApp(readConfig(env, process.cwd()), undefined, undefined, undefined, issuer); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(`${url}/api/config`)).json();
  return { config, post: (input, headers = {}) => fetch(`${url}/api/voice/token`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Token': config.token, ...headers }, body: JSON.stringify(input) }), close: () => new Promise(resolve => server.close(resolve)) };
}
test('Gemini voice is independent of text credentials, disabled by default and protected by local auth', async () => {
  const a = await app({ ALLOW_LIVE_API: 'true', OPENAI_API_KEY: 'synthetic-private-key' });
  try {
    assert.equal(a.config.voice.enabled, false); assert.equal(a.config.defaultProvider, 'mock'); assert(!JSON.stringify(a.config).includes('synthetic-private-key'));
    assert.equal((await a.post({ consent: true })).status, 403);
    assert.equal((await a.post({}, { 'X-Local-Token': 'bad' })).status, 403);
    assert.equal((await a.post({}, { Origin: 'https://example.org' })).status, 403);
  } finally { await a.close(); }
});
test('ephemeral token is one-use, short-lived, constrained to the exact Gemini model and trusted tool', async () => {
  const calls = [];
  const a = await app({ GEMINI_API_KEY: 'synthetic-private-key' }, async params => { calls.push(params); return { name: 'auth_tokens/fake' }; });
  try {
    assert.equal(a.config.voice.enabled, true); assert.equal(a.config.providers.find(p => p.id === 'openai-api').enabled, false);
    assert(!JSON.stringify(a.config).includes('synthetic-private-key'));
    for (const input of [{ consent: false }, { consent: true, model: 'other' }, { consent: true, tools: [] }, { consent: true, url: 'https://example.org' }]) assert.equal((await a.post(input)).status, 400);
    assert.equal(calls.length, 0);
    const response = await a.post({ consent: true }); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.model, GEMINI_LIVE_MODEL); assert.equal(result.token, 'auth_tokens/fake');
    assert(!JSON.stringify(result).includes('synthetic-private-key')); assert.equal(result.config, undefined);
    const config = calls[0].config; assert.equal(config.uses, 1); assert.equal(config.liveConnectConstraints.model, GEMINI_LIVE_MODEL);
    assert(Date.parse(config.expireTime) - Date.now() <= 600000); assert(Date.parse(config.newSessionExpireTime) - Date.now() <= 60000);
    const live = config.liveConnectConstraints.config;
    assert.deepEqual(live.responseModalities, ['AUDIO']); assert.deepEqual(live.inputAudioTranscription, {}); assert.deepEqual(live.outputAudioTranscription, {});
    assert.equal(live.thinkingConfig, undefined); assert.equal(live.enableAffectiveDialog, undefined);
    assert.equal(live.tools.length, 1); const tool = live.tools[0].functionDeclarations[0];
    assert.equal(tool.name, 'workout_action'); assert.equal(tool.behavior, 'NON_BLOCKING');
    assert.deepEqual(tool.parameters.properties.difficulty.enum, ['easy','moderate','challenging']);
    assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ['action','difficulty'].sort());
    assert.equal(config.lockAdditionalFields, undefined); // Full server-side setup locking; no client overrides.
  } finally { await a.close(); }
});
test('Gemini failures and invalid token responses never expose private diagnostics or credentials', async () => {
  for (const issuer of [async () => { throw new Error('synthetic-private-key diagnostics'); }, async () => ({ name: 'not-a-token' })]) {
    const a = await app({ GEMINI_API_KEY: 'synthetic-private-key' }, issuer);
    try { const response = await a.post({ consent: true }); assert.equal(response.status, 502); assert(!(await response.text()).includes('synthetic-private-key')); }
    finally { await a.close(); }
  }
});
test('PCM16 is little-endian, clipped and decodes without corrupting samples', () => {
  const data = encodePcm(new Float32Array([-2, -0.5, 0, 0.5, 2]));
  const bytes = Buffer.from(data, 'base64'); assert.equal(bytes.readInt16LE(0), -32768); assert.equal(bytes.readInt16LE(8), 32767);
  const decoded = decodePcm(data); assert.equal(decoded.length, 5); assert.equal(decoded[1], -0.5); assert.equal(decoded[2], 0); assert(Math.abs(decoded[3] - 0.5) < 0.0001);
  assert.throws(() => decodePcm('x')); assert.throws(() => decodePcm('YQ=='));
});
test('natural text and controlled voice converge on identical canonical transitions', () => {
  for (const [text, update] of [['Make the next one easier.', { action: 'set_difficulty', difficulty: 'easy' }], ['This is too difficult.', { action: 'set_difficulty', difficulty: 'easy' }], ['I need a break.', { action: 'request_recovery' }], ['Skip this block.', { action: 'skip_current_block' }]]) {
    const a = active(), b = active(); a.session.respond(text); assert(b.session.applyIntent(update, b.workout.coachingRevision).ok);
    assert.deepEqual(a.workout.state, b.workout.state); assert.equal(a.session.index, b.session.index); assert.equal(a.session.remaining, b.session.remaining);
  }
});
test('warmup recovery keeps the authored next block and safety text never pushes through symptoms', () => {
  const workout = new WorkoutController(); const session = new WorkoutSession(workout); session.next(); session.next();
  assert(session.allowedVoiceTransitions.includes('recovery')); session.respond('I need a recovery');
  assert.equal(workout.state.phase, 'recovery'); assert.equal(workout.state.trainerAnimation, 'recover'); assert(workout.state.coachCue.includes('break'));
  session.next(); assert.equal(session.index, 3); assert.equal(workout.state.phase, 'active'); session.respond('I feel dizzy'); assert.equal(workout.state.phase, 'stopped');
});
