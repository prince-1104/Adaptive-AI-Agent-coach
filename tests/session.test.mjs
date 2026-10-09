import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WorkoutController } from '../dist/shared/workout/controller.js';
import { WorkoutSession, workoutContextEvent } from '../dist/shared/workout/session.js';
import { validateProgram } from '../dist/shared/openui/validate.js';

test('authored session follows ten stages, uses timer completion and finishes coherently', () => {
  let now = 0; const workout = new WorkoutController(); const session = new WorkoutSession(workout, () => now);
  const visited = [workout.state.phase]; session.next(); visited.push(workout.state.phase); session.next(); visited.push(workout.state.phase);
  now += 3000; session.tick(); assert.equal(workout.state.trainerAnimation, 'demonstrate');
  now += 27000; session.tick(); visited.push(workout.state.phase);
  now += 45000; session.tick(); visited.push(workout.state.phase);
  now += 15000; session.tick(); session.next(); visited.push(workout.state.phase);
  assert.equal(session.index, 5); assert.equal(workout.state.phase, 'adaptation');
  session.chooseDifficulty('easy'); session.next(); visited.push(workout.state.phase);
  assert.equal(workout.state.durationSeconds, 42);
  now += 42000; session.tick(); visited.push(workout.state.phase);
  now += 14000; session.tick(); session.next(); visited.push(workout.state.phase);
  now += 32000; session.tick(); visited.push(workout.state.phase);
  assert.deepEqual(visited, ['intro', 'checkin', 'warmup', 'active', 'recovery', 'adaptation', 'active', 'recovery', 'active', 'complete']);
  assert.equal(session.progress, 1); assert.equal(workout.state.trainerAnimation, 'celebrate');
  session.reset(); assert.equal(session.index, 0); assert.equal(session.progress, 0); assert.equal(workout.state.trainerAnimation, 'greet');
});

test('pause, adaptation, repeated difficulty choices and reset keep one coherent timer', () => {
  let now = 0; const workout = new WorkoutController(); const session = new WorkoutSession(workout, () => now);
  session.respond('ready'); session.respond('tired'); session.respond('start');
  now = 5000; session.tick(); session.pause(true); now = 20000; session.tick();
  assert.equal(workout.state.elapsedSeconds, 5);
  session.chooseDifficulty('easy'); session.chooseDifficulty('easy'); session.pause(false);
  now += 1000; session.tick(); assert.equal(workout.state.elapsedSeconds, 6);
  session.respond('hello'); assert(workout.state.coachCue.includes('warmup'));
  session.reset(); now += 100000; session.tick(); assert.equal(workout.state.phase, 'intro');
});

test('new components validate safe declarative data and reject untrusted media or animation values', () => {
  const program = 'root = Screens([s])\ns = Screen([trainer, progress, coach])\ntrainer = Trainer("greet", "AiRA")\nprogress = Progress(0.4, "Session progress")\ncoach = CoachPanel("Stay with the preview", "warmup")';
  assert.equal(validateProgram(program).props.screens[0].props.children.length, 3);
  for (const patch of ['trainer = Trainer("execute", "AiRA")', 'trainer = Trainer("idle", "AiRA", "https://remote/model.glb")', 'progress = Progress(2, "Bad")', 'coach = CoachPanel("Cue", "invalid")']) assert.throws(() => validateProgram(program + '\n' + patch));
});

test('local GLB contains original geometry and all state and exercise animation clips without external resources', async () => {
  const bytes = await readFile('src/web/assets/aira-trainer.glb');
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12); const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert.deepEqual(gltf.animations.map(a => a.name), ['idle', 'greet', 'ready', 'demonstrate', 'active', 'encourage', 'recover', 'pause', 'celebrate', 'end', ...['demonstrate', 'active'].flatMap(mode => ['warmup', 'march', 'squat', 'lunge'].map(movement => `${mode}_${movement}`))]);
  assert(gltf.meshes.length > 0); assert(gltf.buffers.every(buffer => !buffer.uri)); assert.equal(gltf.images, undefined);
});

test('coaching context stays valid within request bounds and elapsed-only updates preserve its guard', () => {
  const controller = new WorkoutController(); const session = new WorkoutSession(controller, () => 0);
  session.next(); session.next();
  controller.dispatch({ type: 'coach', coachCue: '\n'.repeat(1200), trainerAnimation: 'active' });
  const event = workoutContextEvent(controller.snapshot()); assert(event.length <= 1000);
  const context = JSON.parse(event.slice(event.indexOf('{'))); assert.equal(context.state.phase, 'warmup');
  const coachingRevision = controller.coachingRevision;
  controller.dispatch({ type: 'elapsed', elapsedSeconds: 1 }); assert.equal(controller.coachingRevision, coachingRevision);
  controller.dispatch({ type: 'pause', paused: true }); assert(controller.coachingRevision > coachingRevision);
});
