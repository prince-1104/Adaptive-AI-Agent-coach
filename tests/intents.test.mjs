import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutController } from '../dist/shared/workout/controller.js';
import { WorkoutSession } from '../dist/shared/workout/session.js';
import { interpretWorkoutText, isWorkoutIntent } from '../dist/shared/workout/intents.js';

function fixture(index = 3) {
  let now = 0;
  const controller = new WorkoutController(), session = new WorkoutSession(controller, () => now);
  for (let i = 0; i < index; i++) session.next();
  return { controller, session, advance(seconds) { now += seconds * 1000; session.tick(); } };
}
test('natural phrases use the same validated action for text and voice', () => {
  for (const [action, phrases] of Object.entries({
    pause_workout: ['pause the workout', 'Wait, hold on.', 'Stop.', 'stop for a second'],
    end_workout: ["Okay I'm done.", 'End the workout.', 'I want to stop', 'stop workout', 'finish'],
    repeat_current_block: ['Repeat that.', 'Can we do that one again?', 'one more', 'do that again'],
    request_recovery: ['I need a break.', "I'm tired", 'let me rest', 'Bro this is killing me.'],
    skip_current_block: ["Okay, let's move on.", 'Skip this', 'next'],
    describe_next: ["What's coming next?", 'What are we doing next?'],
  })) for (const text of phrases) {
    assert.deepEqual(interpretWorkoutText(text), { action }, text);
    const a = fixture(), b = fixture(); a.advance(8); b.advance(8);
    a.session.respond(text); assert(b.session.applyIntent({ action }).ok);
    assert.deepEqual(a.controller.state, b.controller.state, text); assert.equal(a.session.index, b.session.index);
  }
  assert.equal(interpretWorkoutText("Don't stop"), null);
});
test('repeat resets the same block and clock, demonstrates, then resumes without duplicate stages', () => {
  const { session, controller, advance } = fixture(6);
  advance(42); assert.equal(session.remaining, 18);
  assert(session.applyIntent({ action: 'repeat_current_block' }).ok);
  assert.equal(session.index, 6); assert.equal(controller.state.movementLabel, 'Squats · Block 2');
  assert.equal(session.remaining, 60); assert.equal(controller.state.progress, 0);
  assert.equal(controller.state.trainerAnimation, 'demonstrate');
  advance(3); assert.equal(controller.state.trainerAnimation, 'active'); assert.equal(session.remaining, 57);
  session.respond('I need a break'); session.respond('Repeat that');
  assert.equal(session.index, 6); assert.equal(controller.state.phase, 'active'); assert.equal(session.remaining, 60);
});
test('pause freezes clock and pose; explicit end cannot advance or complete itself', () => {
  const { session, controller, advance } = fixture(); advance(10);
  session.respond('Stop'); advance(100); assert.equal(session.remaining, 35); assert.equal(controller.state.trainerAnimation, 'pause');
  session.respond('Okay continue'); advance(1); assert.equal(session.remaining, 34);
  session.respond("I'm done"); const ended = controller.snapshot(); advance(1000);
  assert.deepEqual(controller.snapshot(), ended); assert.equal(controller.state.phase, 'stopped'); assert.equal(controller.state.trainerAnimation, 'end');
  assert(session.progress < 1); assert.equal(session.applyIntent({ action: 'advance_workout' }).ok, false);
  session.respond('Start again'); assert.equal(controller.state.phase, 'intro'); assert.equal(session.progress, 0);
});
test('adaptation visibly changes future duration only and returns from the supportive gesture', () => {
  const { session, controller, advance } = fixture(); advance(12);
  session.respond('Make the next one easier'); assert.equal(session.remaining, 33); assert.equal(controller.state.adaptedFrom, 'moderate');
  assert.equal(controller.state.trainerAnimation, 'encourage'); advance(3); assert.equal(controller.state.trainerAnimation, 'active');
  assert.equal(session.secondsAtPace(session.nextBlock.seconds), 42);
  assert.equal(session.secondsAtPace(45), 32);
  session.respond('next'); session.respond('next'); session.respond('next');
  assert.equal(session.remaining, 42); assert.equal(controller.state.adaptedFrom, null);
});
test('invalid, stale, and impossible intents preserve the clock and state atomically', () => {
  const { session, controller, advance } = fixture(); advance(5);
  const revision = controller.coachingRevision; session.respond('pause'); const before = controller.snapshot();
  for (const value of [{ action: 'execute', code: 'evil()' }, { action: 'set_difficulty', difficulty: 'extreme' }, { action: 'pause_workout', durationSeconds: 1 }, null]) {
    assert.equal(isWorkoutIntent(value), false); assert.equal(session.applyIntent(value).ok, false);
  }
  assert.equal(session.applyIntent({ action: 'repeat_current_block' }, revision).ok, false);
  advance(90); assert.deepEqual(controller.snapshot(), before);
  const intro = fixture(0); assert.equal(intro.session.applyIntent({ action: 'repeat_current_block' }).ok, false);
});

test('automatic gesture completion does not invalidate a recovery request in flight', () => {
  const { session, controller, advance } = fixture();
  session.respond('easier'); const revision = controller.coachingRevision;
  advance(4); assert.equal(controller.state.trainerAnimation, 'active');
  assert.equal(controller.coachingRevision, revision);
  assert(session.applyIntent({ action: 'request_recovery' }, revision).ok);
  assert.equal(controller.state.phase, 'recovery');
});


test('trainer journey: tired check-in, struggle, ready recovery, actual shorter next block and completion', () => {
  const { session, controller, advance } = fixture(0);
  session.respond('Start'); session.respond("I'm a little tired. Keep it easy.");
  assert.equal(controller.state.phase, 'checkin'); assert.equal(controller.state.paused, false);
  assert.equal(controller.state.difficulty, 'easy'); assert.equal(controller.state.trainerAnimation, 'ready');
  session.respond("Yes, let's go"); assert.equal(controller.state.phase, 'warmup');
  advance(21); assert.equal(controller.state.phase, 'active');
  const before = session.nextBlockDuration;
  session.respond('This is too difficult.');
  assert.equal(controller.state.phase, 'recovery'); assert.equal(controller.state.trainerAnimation, 'recover');
  assert(session.nextBlockDuration < before); const shorter = session.nextBlockDuration;
  advance(100); assert.equal(controller.state.phase, 'recovery'); assert.equal(session.remaining, 0);
  session.respond("Yes, let's go."); assert.equal(controller.state.movementLabel, 'Squats · Block 2');
  assert.equal(controller.state.durationSeconds, shorter); assert.equal(session.remaining, shorter);
  assert.equal(controller.state.trainerAnimation, 'active');
  advance(shorter); session.respond('Continue'); assert.equal(controller.state.movementLabel, 'Alternating lunges · Block 3');
  advance(session.remaining); assert.equal(controller.state.phase, 'complete');
  assert.equal(controller.state.trainerAnimation, 'celebrate'); assert.equal(session.progress, 1);
  assert.match(session.summary, /2 of 3 blocks completed/); assert.match(controller.state.coachCue, /Session complete/);
});


test('recovery readiness preserves later replies and continuation commits one final state', () => {
  const { session, controller, advance } = fixture();
  session.respond('This is too difficult'); advance(100);
  session.respond('What comes next?'); const cue = controller.state.coachCue;
  assert.match(cue, /Squats.*40 seconds/); advance(1); assert.equal(controller.state.coachCue, cue);
  const revision = controller.revision; session.respond("Yes, let's go");
  assert.equal(controller.revision, revision + 1); assert.equal(controller.state.phase, 'active');
  assert.equal(session.remaining, 40);
});
