import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutController } from '../dist/shared/workout/controller.js';
import { WorkoutSession } from '../dist/shared/workout/session.js';
import { isVoiceUpdate, REALTIME_MODEL } from '../dist/shared/workout/voice.js';
import { createApp, readConfig } from '../dist/server/app.js';

const active = () => { let now = 0; const workout = new WorkoutController(); const session = new WorkoutSession(workout, () => now); session.next(); session.next(); session.next(); return { workout, session, advance: seconds => { now += seconds * 1000; session.tick(); } }; };
test('voice can request an easier upcoming workout at intro without advancing or creating a timer', () => {
  const workout = new WorkoutController(); const session = new WorkoutSession(workout);
  assert(session.applyVoiceUpdate({ difficulty: 'easy' }, workout.coachingRevision).ok);
  assert.equal(workout.state.phase, 'intro'); assert.equal(workout.state.durationSeconds, 0); assert.equal(session.index, 0);
  session.next(); session.next(); assert.equal(workout.state.durationSeconds, 21);
});
test('voice field allowlist rejects capabilities, invalid numbers and unknown enums', () => {
  assert.equal(REALTIME_MODEL, 'gpt-realtime-2.1-mini');
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

async function app(env = {}, transport = async () => { throw new Error('No network expected'); }) {
  const server = createApp(readConfig(env, process.cwd()), transport); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(`${url}/api/config`)).json();
  return { config, post: (path, input, headers = {}) => fetch(`${url}/api/voice/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Token': config.token, ...headers }, body: JSON.stringify(input) }), close: () => new Promise(resolve => server.close(resolve)) };
}
test('voice is independent of text credentials, off by default, token/origin/consent protected', async () => {
  const a = await app({ ALLOW_LIVE_API: 'true', OPENAI_API_KEY: 'synthetic-private-key' });
  try {
    assert.equal(a.config.voice.enabled, false); assert.equal(a.config.defaultProvider, 'mock'); assert(!JSON.stringify(a.config).includes('synthetic-private-key'));
    assert.equal((await a.post('session', { consent: true, sdp: 'v=0\r\n' })).status, 403);
    assert.equal((await a.post('session', {}, { 'X-Local-Token': 'bad' })).status, 403);
    assert.equal((await a.post('session', {}, { Origin: 'https://example.org' })).status, 403);
  } finally { await a.close(); }
});
test('server creates only the fixed Realtime model and tool, retains credentials, and owns hangup handles', async () => {
  const calls = [];
  const a = await app({ ALLOW_REALTIME_VOICE: 'true', OPENAI_API_KEY: 'synthetic-private-key' }, async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/hangup') ? new Response(null, { status: 200 }) : new Response('v=0\r\nsynthetic-answer', { headers: { Location: '/v1/realtime/calls/rtc_test' } });
  });
  try {
    assert.equal(a.config.voice.enabled, true); assert.equal(a.config.providers.find(p => p.id === 'openai-api').enabled, false);
    for (const input of [{ consent: false, sdp: 'v=0' }, { consent: true, sdp: 'bad' }, { consent: true, sdp: 'v=0', url: 'https://example.org' }]) assert.equal((await a.post('session', input)).status, 400);
    assert.equal(calls.length, 0);
    const response = await a.post('session', { consent: true, sdp: 'v=0\r\nsynthetic-offer' }); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.sdp, 'v=0\r\nsynthetic-answer'); assert.match(result.handle, /^[a-f0-9]{48}$/);
    assert(!JSON.stringify(result).includes('synthetic-private-key')); assert(!JSON.stringify(result).includes('rtc_test'));
    const sent = JSON.parse(calls[0].options.body.get('session'));
    assert.equal(sent.model, REALTIME_MODEL); assert.equal(sent.audio.input.turn_detection.interrupt_response, true);
    assert.deepEqual(sent.output_modalities, ['audio']); assert.equal(sent.tools.length, 1); assert.equal(sent.tools[0].name, 'set_workout_state');
    assert.deepEqual(Object.keys(sent.tools[0].parameters.properties).sort(), ['coachCue','difficulty','durationSeconds','phase','trainerAnimation'].sort());
    assert.equal((await a.post('stop', { handle: 'rtc_other' })).status, 400); assert.equal(calls.length, 1);
    assert.equal((await a.post('stop', { handle: result.handle })).status, 200);
    assert.equal(calls[1].url, 'https://api.openai.com/v1/realtime/calls/rtc_test/hangup');
    assert.equal((await a.post('stop', { handle: result.handle })).status, 200); assert.equal(calls.length, 2);
  } finally { await a.close(); }
});
test('provider voice errors never expose raw response bodies or credentials', async () => {
  const a = await app({ ALLOW_REALTIME_VOICE: 'true', OPENAI_API_KEY: 'synthetic-private-key' }, async () => new Response('synthetic-private-key provider details', { status: 401 }));
  try { const response = await a.post('session', { consent: true, sdp: 'v=0' }); assert.equal(response.status, 502); assert(!(await response.text()).includes('synthetic-private-key')); }
  finally { await a.close(); }
});
