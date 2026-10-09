import { WorkoutController, type WorkoutAction } from './controller.js';
import { isVoiceUpdate } from './voice.js';
import { interpretWorkoutText, isWorkoutIntent, type WorkoutIntent } from './intents.js';
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
  { phase: 'checkin', title: 'Find your rhythm.', movement: null, seconds: 0, cue: 'How’s your energy today? Are you feeling relaxed, steady, or energetic? Tell me how you feel.' },
  { phase: 'warmup', title: 'Ease into it.', movement: 'Shoulder rolls', seconds: 30, cue: 'Watch my gentle warm-up demo. We’ll build momentum one step at a time.' },
  { phase: 'active', title: 'Build your momentum.', movement: 'Standing march · Block 1', seconds: 45, cue: 'Keep your movements controlled. Breathe steadily. Tell me if this feels too difficult.' },
  { phase: 'recovery', title: 'A moment to reset.', movement: 'Recovery', seconds: 15, cue: 'One block in. Breathe steadily. Take a short rest. Ready to continue?' },
  { phase: 'adaptation', title: 'Make it your pace.', movement: null, seconds: 0, cue: 'How did that feel? We can shorten the next blocks or keep this rhythm.' },
  { phase: 'active', title: 'Keep the feeling going.', movement: 'Squats · Block 2', seconds: 60, cue: 'Hips back, chest lifted. Watch the controlled lowering, then the return to standing.' },
  { phase: 'recovery', title: 'Room to recharge.', movement: 'Recovery', seconds: 20, cue: 'Two blocks down. Take a short rest, then tell me when you’re ready.' },
  { phase: 'active', title: 'Your final little push.', movement: 'Alternating lunges · Block 3', seconds: 45, cue: 'Watch the alternating steps: soften both knees, then return to standing. Keep a steady rhythm.' },
  { phase: 'complete', title: 'Look at you go.', movement: null, seconds: 0, cue: 'Session complete. You adjusted your pace and finished your session. Well done.' },
];

/** Authored local session policy. TimerLedger remains the only elapsed-time clock. */
export class WorkoutSession {
  private stageIndex = 0;
  private completedBlocks = new Set<number>();
  private shortenedBlocks = new Map<number, number>();
  private recoveryReady = false;
  private encouragementEndsAt: number | undefined;
  private recoveryStage: typeof sessionStages[number] | undefined;
  private readonly timers: TimerLedger;
  constructor(readonly workout: WorkoutController, clock?: () => number) {
    this.timers = new TimerLedger(clock);
    this.workout.dispatch({ type: 'coach', coachCue: sessionStages[0].cue, trainerAnimation: 'greet' });
  }
  get summary(): string { return `${this.completedBlocks.size} of 3 blocks completed · ${this.workout.state.difficulty === 'easy' ? 'Gentle' : this.workout.state.difficulty === 'moderate' ? 'Steady' : 'Challenging'} pace. Skipped blocks are not counted.`; }
  interpret(text: string): WorkoutIntent | null {
    const intent = interpretWorkoutText(text);
    if (['intro', 'checkin'].includes(this.workout.state.phase) && intent?.action === 'request_recovery' && /\btired\b/i.test(text)) return { action: 'set_difficulty', difficulty: 'easy' };
    return intent;
  }
  private continueFromRecovery(): void {
    this.next(true);
  }
  get index(): number { return this.stageIndex; }
  get stage() { return this.workout.state.phase === 'stopped' ? { phase: 'stopped' as const, title: 'Session ended.', movement: this.workout.state.movementLabel, seconds: 0, cue: this.workout.state.coachCue } : this.recoveryStage ?? sessionStages[this.stageIndex]; }
  get nextStage() { return this.workout.state.phase === 'stopped' ? null : sessionStages[this.stageIndex + 1] ?? null; }
  get nextBlockDuration(): number | null { const index = sessionStages.findIndex((stage, index) => index > this.stageIndex && stage.phase === 'active'); return index < 0 ? null : this.shortenedBlocks.get(index) ?? this.secondsAtPace(sessionStages[index].seconds); }
  get nextBlock() { return sessionStages.slice(this.stageIndex + 1).find(stage => stage.phase === 'active') ?? null; }
  secondsAtPace(seconds: number, difficulty = this.workout.state.difficulty): number { return difficulty === 'easy' ? Math.max(5, Math.round(seconds * 7 / 10)) : difficulty === 'challenging' ? Math.round(seconds * 115 / 100) : seconds; }
  get allowedActions(): string[] {
    if (['complete', 'stopped'].includes(this.workout.state.phase)) return ['restart_workout'];
    return ['pause_workout', 'resume_workout', 'end_workout', 'advance_workout', 'skip_current_block', 'set_difficulty', 'ease_and_recover', 'describe_next', 'request_recovery', ...(isTimedPhase(this.workout.state.phase) ? ['repeat_current_block'] : [])];
  }
  get allowedVoiceTransitions(): WorkoutPhase[] {
    const phases = [this.workout.state.phase];
    if (this.nextStage) phases.push(this.nextStage.phase);
    if ((this.workout.state.phase === 'active' || this.workout.state.phase === 'warmup') && !phases.includes('recovery')) phases.push('recovery');
    return [...new Set(phases)];
  }
  get progress(): number { return this.stageIndex === sessionStages.length - 1 ? 1 : (this.stageIndex + this.workout.state.progress) / (sessionStages.length - 1); }
  get remaining(): number { return this.workout.state.durationSeconds - this.workout.state.elapsedSeconds; }
  private duration(seconds: number, index = this.stageIndex): number {
    return (sessionStages[index]?.phase === 'active' ? this.shortenedBlocks.get(index) : undefined) ?? this.secondsAtPace(seconds);
  }
  next(skipAdaptation = false): void {
    if (this.stageIndex >= sessionStages.length - 1 || this.workout.state.phase === 'stopped') return;
    this.encouragementEndsAt = undefined; this.recoveryReady = false;
    const previous = this.stageIndex;
    const previousRecovery = this.recoveryStage;
    this.recoveryStage = undefined;
    this.stageIndex++;
    const intermediate = skipAdaptation && sessionStages[this.stageIndex].phase === 'adaptation' ? sessionStages[this.stageIndex++] : undefined;
    const stage = sessionStages[this.stageIndex];
    const durationSeconds = stage.seconds ? this.duration(stage.seconds) : 0;
    try {
      const action: WorkoutAction = { type: 'transition', phase: stage.phase, movementLabel: stage.movement, durationSeconds, coachCue: stage.cue };
      if (intermediate) this.workout.dispatchBatch([{ type: 'transition', phase: intermediate.phase, movementLabel: null, durationSeconds: 0, coachCue: intermediate.cue }, action]);
      else this.workout.dispatch(action);
    } catch (error) { this.stageIndex = previous; this.recoveryStage = previousRecovery; throw error; }
    this.timers.forget();
    if (durationSeconds) { this.timers.ensure('session', { label: stage.movement!, seconds: durationSeconds }); this.timers.start('session'); }
  }
  tick(): void {
    const timer = this.timers.list()[0];
    if (!timer || this.workout.state.paused || this.workout.state.phase === 'stopped') return;
    this.workout.dispatch({ type: 'elapsed', elapsedSeconds: Math.floor(timer.seconds - timer.remaining) });
    if (this.stage.phase === 'active' && this.workout.state.elapsedSeconds >= 3 && this.workout.state.trainerAnimation === 'demonstrate') {
      this.workout.dispatch({ type: 'coach', coachCue: this.workout.state.coachCue, trainerAnimation: 'active' });
    }
    if (this.encouragementEndsAt !== undefined && this.workout.state.elapsedSeconds >= this.encouragementEndsAt) {
      this.encouragementEndsAt = undefined;
      if (this.workout.state.trainerAnimation === 'encourage') this.workout.dispatch({ type: 'coach', coachCue: this.workout.state.coachCue, trainerAnimation: this.stage.phase === 'active' ? 'active' : this.stage.phase === 'warmup' ? 'demonstrate' : 'recover' });
    }
    if (timer.status === 'done') {
      if (this.workout.state.phase === 'recovery') {
        if (!this.recoveryReady) {
          this.recoveryReady = true;
          this.workout.dispatch({ type: 'coach', coachCue: 'Ready when you are. Say “yes, let’s go” to begin the next block.', trainerAnimation: 'recover' });
        }
      } else {
        if (this.workout.state.phase === 'active') this.completedBlocks.add(this.stageIndex);
        this.next();
      }
    }
  }
  pause(paused: boolean): void {
    if (['complete', 'stopped'].includes(this.workout.state.phase) || paused === this.workout.state.paused) return;
    this.timers.pause('session');
    this.workout.dispatch({ type: 'pause', paused });
  }
  chooseDifficulty(difficulty: WorkoutDifficulty): void { this.applyIntent({ action: 'set_difficulty', difficulty }); }
  reset(): void {
    this.encouragementEndsAt = undefined;
    this.recoveryReady = false; this.completedBlocks.clear(); this.shortenedBlocks.clear();
    this.stageIndex = 0; this.recoveryStage = undefined; this.timers.forget(); this.workout.reset();
    this.workout.dispatch({ type: 'coach', coachCue: sessionStages[0].cue, trainerAnimation: 'greet' });
  }
  /** Untrusted voice arguments never become controller actions without local policy. */
  applyVoiceUpdate(value: unknown, expectedCoachingRevision: number): { ok: boolean; error?: string; state: WorkoutState } {
    const failure = (error: string) => ({ ok: false, error, state: this.workout.state });
    if (!isVoiceUpdate(value)) return failure('Invalid workout fields.');
    if (expectedCoachingRevision !== this.workout.coachingRevision) return failure('Workout changed while you were speaking. Please try again.');
    const state = this.workout.state;
    if (state.phase === 'complete' || state.phase === 'stopped') return failure('Session complete. Restart with the local session control.');
    let index = this.stageIndex, stage = this.stage, recovery = this.recoveryStage;
    const actions: WorkoutAction[] = [];
    const advancing = value.phase !== undefined && value.phase !== state.phase;
    if (advancing) {
      if (this.nextStage?.phase === value.phase) { index++; stage = sessionStages[index]; recovery = undefined; }
      else if ((state.phase === 'active' || state.phase === 'warmup') && value.phase === 'recovery') {
        stage = { phase: 'recovery', title: 'Room to recharge.', movement: 'Recovery', seconds: 20, cue: 'A short reset before we finish.' }; recovery = stage;
      } else return failure('Only the authored next stage or a timed-movement recovery is allowed.');
      actions.push({ type: 'transition', phase: stage.phase, movementLabel: stage.movement,
        durationSeconds: stage.seconds ? this.duration(stage.seconds, index) : 0, coachCue: value.coachCue ?? stage.cue });
    }
    if (advancing && stage.phase === 'complete' && (value.difficulty !== undefined || value.durationSeconds !== undefined || (value.trainerAnimation !== undefined && value.trainerAnimation !== 'celebrate'))) return failure('Completion uses the authored final state.');
    if (value.difficulty !== undefined || value.durationSeconds !== undefined) {
      const durationSeconds = value.durationSeconds ?? (advancing ? stage.seconds ? this.secondsAtPace(stage.seconds, value.difficulty ?? state.difficulty) : 0 : state.durationSeconds);
      actions.push({ type: 'adapt', difficulty: value.difficulty ?? state.difficulty, durationSeconds });
    }
    if (stage.phase !== 'complete' && (value.coachCue !== undefined || value.trainerAnimation !== undefined)) {
      const defaults = { intro: 'greet', checkin: 'ready', warmup: 'demonstrate', active: 'active', recovery: 'recover', adaptation: 'encourage', complete: 'celebrate', stopped: 'end' } as const;
      actions.push({ type: 'coach', coachCue: value.coachCue ?? (advancing ? stage.cue : state.coachCue), trainerAnimation: value.trainerAnimation ?? (advancing ? defaults[stage.phase] : state.trainerAnimation) });
    }
    const previousIndex = this.stageIndex, previousRecovery = this.recoveryStage;
    this.stageIndex = index; this.recoveryStage = recovery;
    try { this.workout.dispatchBatch(actions); }
    catch { this.stageIndex = previousIndex; this.recoveryStage = previousRecovery; return failure('Controller rejected this transition or duration.'); }
    if (advancing || value.durationSeconds !== undefined) {
      this.recoveryReady = false;
      this.timers.forget();
      const next = this.workout.state;
      if (next.durationSeconds) {
        this.timers.ensure('session', { label: stage.movement!, seconds: next.durationSeconds }); this.timers.start('session');
        this.timers.advance(next.elapsedSeconds); if (next.paused) this.timers.pause('session');
      }
    }
    return { ok: true, state: this.workout.state };
  }
  /** One action gateway for text, UI controls and the Gemini tool. */
  applyIntent(value: unknown, expectedRevision = this.workout.coachingRevision): { ok: boolean; error?: string; state: WorkoutState } {
    const failure = (error: string) => ({ ok: false, error, state: this.workout.state });
    if (!isWorkoutIntent(value)) return failure('Invalid workout action or arguments.');
    if (expectedRevision !== this.workout.coachingRevision) return failure('Workout changed. Use the current context before trying again.');
    const state = this.workout.state;
    if (value.action === 'restart_workout') { this.reset(); return { ok: true, state: this.workout.state }; }
    if (state.phase === 'complete' || state.phase === 'stopped') return failure('This session has finished. Start again when you are ready.');
    try {
      switch (value.action) {
        case 'pause_workout': this.pause(true); break;
        case 'resume_workout': if (state.paused) this.pause(false); else if (state.phase === 'recovery') this.continueFromRecovery(); else this.next(); break;
        case 'advance_workout': if (state.phase === 'recovery') this.continueFromRecovery(); else this.next(); break;
        case 'skip_current_block': this.next(); break;
        case 'end_workout': this.workout.dispatch({ type: 'end' }); this.timers.forget(); this.encouragementEndsAt = undefined; break;
        case 'repeat_current_block': {
          let target = this.stageIndex;
          if (state.phase === 'recovery') { while (target >= 0 && !['active', 'warmup'].includes(sessionStages[target].phase)) target--; }
          if (target < 0 || !['active', 'warmup', 'recovery'].includes(state.phase)) return failure('There is no exercise to repeat yet. Begin the warm-up first.');
          const stage = sessionStages[target];
          if (stage.phase !== 'active' && stage.phase !== 'warmup') return failure('There is no exercise to repeat.');
          const previous = this.stageIndex, recovery = this.recoveryStage; this.stageIndex = target; this.recoveryStage = undefined;
          try { this.workout.dispatch({ type: 'repeat', phase: stage.phase, movementLabel: stage.movement!, durationSeconds: this.duration(stage.seconds), coachCue: 'Sure. Let’s take that one again. Watch the movement, then find your rhythm.' }); }
          catch (error) { this.stageIndex = previous; this.recoveryStage = recovery; throw error; }
          this.timers.forget(); this.timers.ensure('session', { label: stage.movement!, seconds: this.workout.state.durationSeconds }); this.timers.start('session');
          this.encouragementEndsAt = undefined;
          break;
        }
        case 'request_recovery':
          if (state.phase === 'recovery') { if (state.paused) this.pause(false); break; }
          if (!isTimedPhase(state.phase)) { this.pause(true); break; }
          return this.applyVoiceUpdate({ phase: 'recovery', coachCue: 'Of course. Take a break. We’ll continue when you’re ready.' }, expectedRevision);
        case 'ease_and_recover': {
          if (!['active', 'warmup'].includes(state.phase)) return this.applyIntent({ action: 'set_difficulty', difficulty: 'easy' }, expectedRevision);
          const target = sessionStages.findIndex((stage, index) => index > this.stageIndex && stage.phase === 'active');
          const before = this.nextBlockDuration;
          const shortened = before === null ? null : Math.max(5, Math.min(this.secondsAtPace(sessionStages[target].seconds, 'easy'), Math.round(before * 2 / 3)));
          const result = this.applyVoiceUpdate({ phase: 'recovery', difficulty: 'easy', coachCue: `Got it.${shortened === null ? '' : ` The next block is now ${shortened} seconds instead of ${before}.`} Take a short rest. Ready to continue?` }, expectedRevision);
          if (result.ok && target >= 0 && shortened !== null) this.shortenedBlocks.set(target, shortened);
          return result;
        }
        case 'set_difficulty': {
          this.workout.dispatchBatch([
            { type: 'adapt', difficulty: value.difficulty, durationSeconds: state.durationSeconds },
            { type: 'coach', coachCue: value.difficulty === 'easy' ? ['intro', 'checkin'].includes(state.phase) ? 'Got it. We’ll keep it easy. Your shorter plan is ready. Let’s start with a gentle warm-up.' : 'Got it. I’ll bring the next block down. Your current timer stays the same.' : value.difficulty === 'challenging' ? 'A little more challenge for the next block. Keep it controlled.' : 'Back to a steady pace for the next block.', trainerAnimation: ['intro', 'checkin'].includes(state.phase) ? 'ready' : 'encourage' },
          ]); this.encouragementEndsAt = isTimedPhase(state.phase) ? state.elapsedSeconds + 3 : undefined; break;
        }
        case 'describe_next': {
          const upcoming = state.phase === 'recovery' ? this.nextBlock : this.nextStage;
          const seconds = state.phase === 'recovery' ? this.nextBlockDuration : upcoming?.seconds ? this.secondsAtPace(upcoming.seconds) : 0;
          this.workout.dispatch({ type: 'coach', coachCue: upcoming ? `Next: ${upcoming.movement ?? upcoming.title}${seconds ? ` · ${seconds} seconds` : ''}. ${upcoming.cue}` : 'The session summary is next. You can finish when you’re ready.', trainerAnimation: state.trainerAnimation }); break;
        }
      }
      return { ok: true, state: this.workout.state };
    } catch { return failure('That action is not valid for the current workout.'); }
  }
  handlesText(text: string): boolean { return this.interpret(text) !== null; }
  respond(text: string): void {
    const intent = this.interpret(text);
    if (intent) {
      const result = this.applyIntent(intent);
      if (!result.ok && !['complete', 'stopped'].includes(this.workout.state.phase)) this.workout.dispatch({ type: 'coach', coachCue: result.error ?? 'Try another session control.', trainerAnimation: this.workout.state.trainerAnimation });
      return;
    }
    if (['complete', 'stopped'].includes(this.workout.state.phase)) return;
    this.workout.dispatch({ type: 'coach', coachCue: `We’re in ${this.stage.phase === 'active' ? this.stage.movement : this.stage.phase}. You can ask me to pause, repeat this movement, take a break or move on.`, trainerAnimation: this.workout.state.trainerAnimation });
  }
}
