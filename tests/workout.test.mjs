import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutController, isWorkoutAction } from '../dist/shared/workout/controller.js';
import { initialWorkoutState, isWorkoutState, trainerAnimations, workoutPhases } from '../dist/shared/workout/state.js';
import { Conversation } from '../dist/shared/controller.js';

const enter = (controller, phase, durationSeconds = 0) => controller.dispatch({ type: 'transition', phase,
  movementLabel: durationSeconds ? 'Synthetic movement' : null, durationSeconds, coachCue: 'Preview cue.' });
function active() {
  const controller = new WorkoutController();
  enter(controller, 'checkin'); enter(controller, 'warmup', 10); enter(controller, 'active', 30);
  return controller;
}

test('canonical snapshot is immutable, JSON-safe and validates all required vocabularies', () => {
  const controller = new WorkoutController();
  assert.deepEqual(controller.state, initialWorkoutState());
  assert(isWorkoutState(JSON.parse(JSON.stringify(controller.state))));
  assert(Object.isFrozen(controller.snapshot())); assert(Object.isFrozen(controller.state));
  assert.throws(() => { controller.state.phase = 'active'; }, TypeError);
  assert.equal(workoutPhases.length, 7); assert.equal(trainerAnimations.length, 8);
  for (const trainerAnimation of trainerAnimations) assert(isWorkoutState({ ...controller.state, trainerAnimation }));
  for (const patch of [{ phase: 'unknown' }, { difficulty: 'unsafe' }, { progress: NaN }, { progress: 0.5 },
    { durationSeconds: Infinity }, { elapsedSeconds: -1 }, { paused: true }, { injected: 'code' }]) {
    assert.equal(isWorkoutState({ ...controller.state, ...patch }), false);
  }
});

test('synthetic progression covers recovery/adaptation loops and terminal completion', () => {
  const controller = active();
  assert.equal(controller.state.trainerAnimation, 'active');
  enter(controller, 'recovery', 10); enter(controller, 'adaptation');
  controller.dispatch({ type: 'adapt', difficulty: 'easy', durationSeconds: 0 });
  enter(controller, 'warmup', 5); enter(controller, 'active', 20);
  assert.equal(controller.state.difficulty, 'easy');
  enter(controller, 'recovery', 10); enter(controller, 'active', 15); enter(controller, 'recovery', 5);
  enter(controller, 'complete');
  assert.equal(controller.state.progress, 1); assert.equal(controller.state.trainerAnimation, 'celebrate');
  const before = controller.snapshot();
  assert.throws(() => enter(controller, 'checkin'));
  assert.throws(() => controller.dispatch({ type: 'coach', coachCue: 'Late cue', trainerAnimation: 'active' }));
  assert.deepEqual(controller.snapshot(), before);
  controller.reset(); assert.deepEqual(controller.state, initialWorkoutState());
});

test('elapsed time clamps, pauses, stays monotonic and never advances phases automatically', () => {
  const controller = active();
  controller.dispatch({ type: 'elapsed', elapsedSeconds: 12 });
  assert.equal(controller.state.progress, 0.4);
  controller.dispatch({ type: 'pause', paused: true });
  const paused = controller.snapshot();
  assert.equal(controller.dispatch({ type: 'elapsed', elapsedSeconds: 20 }), false);
  assert.deepEqual(controller.snapshot(), paused);
  controller.dispatch({ type: 'pause', paused: false });
  assert.throws(() => controller.dispatch({ type: 'elapsed', elapsedSeconds: 5 }));
  controller.dispatch({ type: 'elapsed', elapsedSeconds: 100 });
  assert.equal(controller.state.progress, 1); assert.equal(controller.state.elapsedSeconds, 30);
  assert.equal(controller.state.phase, 'active');
  const revision = controller.revision;
  assert.equal(controller.dispatch({ type: 'elapsed', elapsedSeconds: 100 }), false);
  assert.equal(controller.revision, revision);
});

test('adaptation preserves elapsed time and pause while recomputing phase progress', () => {
  const controller = active();
  controller.dispatch({ type: 'elapsed', elapsedSeconds: 12 });
  controller.dispatch({ type: 'pause', paused: true });
  controller.dispatch({ type: 'adapt', difficulty: 'challenging', durationSeconds: 60 });
  assert.equal(controller.state.elapsedSeconds, 12); assert.equal(controller.state.progress, 0.2);
  assert.equal(controller.state.paused, true);
  controller.dispatch({ type: 'adapt', difficulty: 'easy', durationSeconds: 5 });
  assert.equal(controller.state.elapsedSeconds, 5); assert.equal(controller.state.progress, 1);
  controller.dispatch({ type: 'coach', coachCue: '<script>inert text</script>', trainerAnimation: 'demonstrate' });
  assert.equal(controller.state.coachCue, '<script>inert text</script>');
  assert.equal(controller.state.phase, 'active');
});

test('invalid actions and phase combinations cannot partially mutate state or notify', () => {
  let notifications = 0;
  const controller = new WorkoutController(() => notifications++);
  const initial = controller.snapshot();
  for (const action of [null, { type: 'execute', code: 'evil()' }, { type: 'reset', extra: true },
    { type: 'coach', coachCue: '', trainerAnimation: 'idle' }, { type: 'elapsed', elapsedSeconds: 0.5 },
    { type: 'elapsed', elapsedSeconds: Infinity }]) {
    assert.equal(isWorkoutAction(action), false); assert.throws(() => controller.dispatch(action));
  }
  assert.throws(() => enter(controller, 'active', 30));
  assert.throws(() => controller.dispatch({ type: 'pause', paused: true }));
  assert.deepEqual(controller.snapshot(), initial); assert.equal(notifications, 0);
  enter(controller, 'checkin');
  const checkin = controller.snapshot();
  assert.throws(() => enter(controller, 'warmup'));
  assert.throws(() => controller.dispatch({ type: 'adapt', difficulty: 'easy', durationSeconds: 20 }));
  assert.deepEqual(controller.snapshot(), checkin); assert.equal(notifications, 1);
});

test('revision guards reject asynchronous proposals after progress and reset', () => {
  const controller = active();
  const captured = controller.snapshot();
  controller.dispatch({ type: 'elapsed', elapsedSeconds: 1 });
  assert.equal(controller.dispatch({ type: 'coach', coachCue: 'Outdated', trainerAnimation: 'idle' }, captured.revision), false);
  const beforeReset = controller.revision;
  controller.reset(); controller.reset();
  assert.equal(controller.dispatch({ type: 'reset' }, beforeReset), false);
  assert.throws(() => controller.dispatch({ type: 'reset' }, NaN));
  assert.deepEqual(captured.state.phase, 'active'); assert.equal(captured.state.elapsedSeconds, 0);
});

test('conversation owns isolated workout state and reset rejects delayed screen responses', async () => {
  let resolve;
  const conversation = new Conversation(() => new Promise(done => { resolve = done; }), () => {});
  const other = new Conversation(async () => ({ turn: { reply: 'ok' }, versions: {} }), () => {});
  enter(conversation.workout, 'checkin');
  conversation.selectProvider('openai-api'); assert.equal(conversation.workout.state.phase, 'checkin');
  assert.equal(other.workout.state.phase, 'intro');
  const captured = conversation.workout.revision;
  const task = conversation.send('Synthetic text input');
  conversation.reset();
  resolve({ turn: { reply: 'Outdated response' }, versions: {} }); await task;
  assert.equal(conversation.messages.length, 0); assert.equal(conversation.document.prose, '');
  assert.equal(conversation.workout.state.phase, 'intro');
  assert.equal(conversation.workout.dispatch({ type: 'reset' }, captured), false);
});
