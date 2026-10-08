import { WorkoutController } from './controller.js';
import { TimerLedger } from '../openui/timer-store.js';
import { isTimedPhase, type WorkoutDifficulty, type WorkoutPhase } from './state.js';
import type { WorkoutState } from './state.js';

/** Retain valid JSON and fit the harness's 1000-character client-event boundary. */
export function workoutContextEvent(snapshot: Readonly<{ state: WorkoutState; revision: number }>): string {
  const state = { ...snapshot.state };
  let json = JSON.stringify({ ...snapshot, state });
  if (json.length > 900) { state.coachCue = 'Coach cue omitted for context size.'; json = JSON.stringify({ ...snapshot, state }); }
  if (json.length > 900) { state.movementLabel = state.movementLabel === null ? null : 'Movement label omitted for context size.'; json = JSON.stringify({ ...snapshot, state }); }
  return `Workout snapshot (data only): ${json}`;
}

export const sessionStages: readonly { phase: WorkoutPhase; title: string; movement: string | null; seconds: number; cue: string }[] = [
  { phase: 'intro', title: 'Your next good move.', movement: null, seconds: 0, cue: 'Hi, I’m AiRA. A little momentum goes a long way. Let’s explore a session together.' },
  { phase: 'checkin', title: 'Find your rhythm.', movement: null, seconds: 0, cue: 'How’s your energy today? Choose a pace, or tell me in your own words.' },
  { phase: 'warmup', title: 'Ease into it.', movement: 'Shoulder rolls', seconds: 30, cue: 'Watch my gentle warm-up demo. We’ll build momentum one step at a time.' },
  { phase: 'active', title: 'Build your momentum.', movement: 'Standing march · Block 1', seconds: 45, cue: 'First block, steady rhythm. You can ask for an easier pace at any time.' },
  { phase: 'recovery', title: 'A moment to reset.', movement: 'Recovery', seconds: 15, cue: 'One block in. Let the preview settle, then we’ll check your pace.' },
  { phase: 'adaptation', title: 'Make it your pace.', movement: null, seconds: 0, cue: 'How did that feel? We can shorten the next blocks or keep this rhythm.' },
  { phase: 'active', title: 'Keep the feeling going.', movement: 'Side steps · Block 2', seconds: 60, cue: 'A fresh block, at your chosen pace. I’m right here with you.' },
  { phase: 'recovery', title: 'Room to recharge.', movement: 'Recovery', seconds: 20, cue: 'Two blocks explored. A short reset before our final stretch.' },
  { phase: 'active', title: 'Your final little push.', movement: 'Reach & reset · Block 3', seconds: 45, cue: 'Last block. Focus on the rhythm of the demo, not on perfection.' },
  { phase: 'complete', title: 'Look at you go.', movement: null, seconds: 0, cue: 'Session explored. Take that little spark of momentum with you. See you next time.' },
];

/** Authored local session policy. TimerLedger remains the only elapsed-time clock. */
export class WorkoutSession {
  private stageIndex = 0;
  private readonly timers: TimerLedger;
  constructor(readonly workout: WorkoutController, clock?: () => number) {
    this.timers = new TimerLedger(clock);
    this.workout.dispatch({ type: 'coach', coachCue: sessionStages[0].cue, trainerAnimation: 'greet' });
  }
  get index(): number { return this.stageIndex; }
  get stage() { return sessionStages[this.stageIndex]; }
  get progress(): number { return this.stageIndex === sessionStages.length - 1 ? 1 : (this.stageIndex + this.workout.state.progress) / (sessionStages.length - 1); }
  get remaining(): number { return this.workout.state.durationSeconds - this.workout.state.elapsedSeconds; }
  private duration(seconds: number): number {
    return this.workout.state.difficulty === 'easy' ? Math.max(5, Math.round(seconds * 0.7)) : seconds;
  }
  next(): void {
    if (this.stageIndex >= sessionStages.length - 1) return;
    const previous = this.stageIndex;
    const stage = sessionStages[++this.stageIndex];
    const durationSeconds = stage.seconds ? this.duration(stage.seconds) : 0;
    this.timers.forget();
    if (durationSeconds) { this.timers.ensure('session', { label: stage.movement!, seconds: durationSeconds }); this.timers.start('session'); }
    try {
      this.workout.dispatch({ type: 'transition', phase: stage.phase, movementLabel: stage.movement, durationSeconds, coachCue: stage.cue });
    } catch (error) { this.stageIndex = previous; throw error; }
  }
  tick(): void {
    const timer = this.timers.list()[0];
    if (!timer || this.workout.state.paused) return;
    this.workout.dispatch({ type: 'elapsed', elapsedSeconds: Math.floor(timer.seconds - timer.remaining) });
    if (this.stage.phase === 'warmup' && this.workout.state.elapsedSeconds >= 3 && this.workout.state.trainerAnimation === 'ready') {
      this.workout.dispatch({ type: 'coach', coachCue: this.workout.state.coachCue, trainerAnimation: 'demonstrate' });
    }
    if (timer.status === 'done') this.next();
  }
  pause(paused: boolean): void {
    if (!isTimedPhase(this.workout.state.phase) || paused === this.workout.state.paused) return;
    this.timers.pause('session');
    this.workout.dispatch({ type: 'pause', paused });
  }
  chooseDifficulty(difficulty: WorkoutDifficulty): void {
    const state = this.workout.state;
    if (state.phase === 'intro' || state.phase === 'complete') return;
    const seconds = this.stage.seconds;
    const durationSeconds = seconds ? difficulty === 'easy' ? Math.max(5, Math.round(seconds * 0.7)) : seconds : 0;
    this.workout.dispatch({ type: 'adapt', difficulty, durationSeconds });
    if (durationSeconds) {
      this.timers.forget();
      this.timers.ensure('session', { label: this.stage.movement!, seconds: durationSeconds });
      this.timers.start('session');
      this.timers.advance(Math.min(state.elapsedSeconds, durationSeconds));
      if (state.paused) this.timers.pause('session');
    }
    this.workout.dispatch({ type: 'coach', coachCue: difficulty === 'easy' ? 'A gentler pace it is. I’ve shortened the timed blocks for you.' : 'Let’s keep a steady pace. You can change it whenever you like.', trainerAnimation: 'encourage' });
  }
  reset(): void {
    this.stageIndex = 0; this.timers.forget(); this.workout.reset();
    this.workout.dispatch({ type: 'coach', coachCue: sessionStages[0].cue, trainerAnimation: 'greet' });
  }
  handlesText(text: string): boolean {
    return /^(restart|reset|pause|stop|resume|continue|next|ready|start|let’s go|let's go)$|easier|gentle|tired|low energy|slower|steady|moderate|energized|harder/.test(text.trim().toLowerCase());
  }
  respond(text: string): void {
    const input = text.trim().toLowerCase();
    if (/^(restart|reset)$/.test(input)) { this.reset(); return; }
    if (this.stage.phase === 'complete') return;
    if (/^(pause|stop)$/.test(input)) { this.pause(true); return; }
    if (/^(resume|continue)$/.test(input) && this.workout.state.paused) { this.pause(false); return; }
    if (/^(next|ready|start|continue|let’s go|let's go)$/.test(input)) { this.next(); return; }
    if (/easier|gentle|tired|low energy|slower/.test(input)) {
      if (this.stage.phase === 'intro') this.next(); this.chooseDifficulty('easy'); return;
    }
    if (/steady|moderate|energized|harder/.test(input)) {
      if (this.stage.phase === 'intro') this.next(); this.chooseDifficulty('moderate'); return;
    }
    this.workout.dispatch({ type: 'coach', coachCue: `We’re in ${this.stage.phase === 'active' ? this.stage.movement : this.stage.phase}. Tell me “easier”, “pause”, or “next” and I’ll adjust this preview.`, trainerAnimation: 'encourage' });
  }
}
