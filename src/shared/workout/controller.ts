import { obj, str, valid, type Schema } from '../schema.js';
import { animationSchema, difficultySchema, durationSchema, initialWorkoutState, isTimedPhase, isWorkoutState,
  movementSchema, workoutPhases, type TrainerAnimation, type WorkoutDifficulty, type WorkoutPhase, type WorkoutState } from './state.js';

/** Trusted adapters translate text and optional voice into these data-only actions. */
export type WorkoutAction =
  | { type: 'transition'; phase: WorkoutPhase; movementLabel: string | null; durationSeconds: number; coachCue: string }
  | { type: 'elapsed'; elapsedSeconds: number }
  | { type: 'pause'; paused: boolean }
  | { type: 'adapt'; difficulty: WorkoutDifficulty; durationSeconds: number }
  | { type: 'coach'; coachCue: string; trainerAnimation: TrainerAnimation }
  | { type: 'repeat'; phase: 'warmup' | 'active'; movementLabel: string; durationSeconds: number; coachCue: string }
  | { type: 'end' }
  | { type: 'reset' };

const transitions: Record<WorkoutPhase, readonly WorkoutPhase[]> = {
  intro: ['checkin'], checkin: ['warmup'], warmup: ['active', 'adaptation', 'recovery'],
  active: ['recovery', 'adaptation', 'complete'], recovery: ['active', 'adaptation', 'complete'],
  adaptation: ['warmup', 'active', 'recovery'], complete: [], stopped: [],
};
const animations: Record<WorkoutPhase, TrainerAnimation> = {
  intro: 'greet', checkin: 'ready', warmup: 'demonstrate', active: 'active',
  recovery: 'recover', adaptation: 'encourage', complete: 'celebrate', stopped: 'end',
};
const actionSchemas: Record<WorkoutAction['type'], Schema> = {
  transition: obj({ type: { type: 'string', enum: ['transition'] }, phase: { type: 'string', enum: [...workoutPhases] },
    movementLabel: movementSchema, durationSeconds: durationSchema, coachCue: str(1200) }),
  elapsed: obj({ type: { type: 'string', enum: ['elapsed'] }, elapsedSeconds: durationSchema }),
  pause: obj({ type: { type: 'string', enum: ['pause'] }, paused: { type: 'boolean' } }),
  adapt: obj({ type: { type: 'string', enum: ['adapt'] }, difficulty: difficultySchema, durationSeconds: durationSchema }),
  coach: obj({ type: { type: 'string', enum: ['coach'] }, coachCue: str(1200), trainerAnimation: animationSchema }),
  reset: obj({ type: { type: 'string', enum: ['reset'] } }),
  end: obj({ type: { type: 'string', enum: ['end'] } }),
  repeat: obj({ type: { type: 'string', enum: ['repeat'] }, phase: { type: 'string', enum: ['warmup', 'active'] }, movementLabel: str(120), durationSeconds: durationSchema, coachCue: str(1200) }),
};

export function isWorkoutAction(value: unknown): value is WorkoutAction {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'type')) return false;
  const type = (value as { type: unknown }).type;
  return typeof type === 'string' && Object.hasOwn(actionSchemas, type) && valid(actionSchemas[type as WorkoutAction['type']], value);
}

/** No DOM, provider, audio, autonomous clock or interpretation of model code. */
export class WorkoutController {
  private current = initialWorkoutState();
  private version = 0;
  private coachVersion = 0;
  constructor(private changed: (state: WorkoutState) => void = () => {}) {}
  get state(): WorkoutState { return this.current; }
  get revision(): number { return this.version; }
  /** Elapsed-only ticks do not invalidate a reply about the same movement/pace. */
  get coachingRevision(): number { return this.coachVersion; }
  snapshot(): Readonly<{ state: WorkoutState; revision: number }> {
    return Object.freeze({ state: this.current, revision: this.version });
  }
  reset(): void { this.dispatch({ type: 'reset' }); }

  /** Validate the entire transaction before committing; a rejected tool changes nothing. */
  dispatchBatch(actions: readonly WorkoutAction[], expectedRevision = this.version): boolean {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid workout revision.');
    if (expectedRevision !== this.version) return false;
    const trial = new WorkoutController();
    trial.current = this.current;
    for (const action of actions) trial.dispatch(action);
    if (!trial.version) return false;
    this.current = trial.current;
    this.version++;
    this.coachVersion++;
    this.changed(this.current);
    return true;
  }

  /** Capture revision before asynchronous work; stale results cannot mutate state. */
  dispatch(action: WorkoutAction, expectedRevision = this.version): boolean {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid workout revision.');
    if (expectedRevision !== this.version) return false;
    if (!isWorkoutAction(action)) throw new Error('Invalid workout action.');
    const state = this.current;
    let next: WorkoutState;
    if (action.type === 'reset') next = initialWorkoutState();
    else {
      if (state.phase === 'complete' || state.phase === 'stopped') throw new Error('Reset before changing a finished workout.');
      switch (action.type) {
        case 'transition':
          if (!transitions[state.phase].includes(action.phase)) throw new Error('Invalid workout phase transition.');
          next = { ...state, phase: action.phase, movementLabel: action.movementLabel, durationSeconds: action.durationSeconds,
            coachCue: action.coachCue, trainerAnimation: animations[action.phase], elapsedSeconds: 0,
            progress: action.phase === 'complete' ? 1 : 0, paused: false, adaptedFrom: null };
          break;
        case 'repeat':
          if (!isTimedPhase(state.phase) || (state.phase !== 'recovery' && (state.phase !== action.phase || state.movementLabel !== action.movementLabel))) throw new Error('No valid current movement to repeat.');
          next = { ...state, phase: action.phase, movementLabel: action.movementLabel, durationSeconds: action.durationSeconds, elapsedSeconds: 0, progress: 0, paused: false, trainerAnimation: 'demonstrate', coachCue: action.coachCue, adaptedFrom: null };
          break;
        case 'end':
          next = { ...state, phase: 'stopped', paused: false, trainerAnimation: 'end', coachCue: 'Okay. We’ll stop here. Your session has ended.', adaptedFrom: null };
          break;
        case 'elapsed':
          if (!isTimedPhase(state.phase)) throw new Error('This workout phase has no simulated timer.');
          if (state.paused) return false;
          if (action.elapsedSeconds < state.elapsedSeconds) throw new Error('Elapsed time cannot move backwards.');
          const elapsedSeconds = Math.min(action.elapsedSeconds, state.durationSeconds);
          next = { ...state, elapsedSeconds, progress: elapsedSeconds / state.durationSeconds };
          break;
        case 'pause':
          next = { ...state, paused: action.paused, trainerAnimation: action.paused ? 'pause' : animations[state.phase], coachCue: action.paused ? 'Okay. Pausing here. Resume when you’re ready, or end the session.' : 'Back with you. Let’s continue at your pace.' };
          break;
        case 'adapt':
          if (!isTimedPhase(state.phase) && state.phase !== 'intro' && state.phase !== 'checkin' && state.phase !== 'adaptation') throw new Error('This phase cannot adapt.');
          const elapsed = Math.min(state.elapsedSeconds, action.durationSeconds);
          next = { ...state, difficulty: action.difficulty, durationSeconds: action.durationSeconds,
            elapsedSeconds: elapsed, progress: action.durationSeconds ? elapsed / action.durationSeconds : 0,
            adaptedFrom: action.difficulty === state.difficulty ? state.adaptedFrom : state.difficulty };
          break;
        case 'coach':
          next = { ...state, coachCue: action.coachCue, trainerAnimation: state.paused ? 'pause' : action.trainerAnimation };
          break;
      }
    }
    if (!isWorkoutState(next)) throw new Error('Invalid workout state.');
    if (action.type !== 'reset' && Object.keys(next).every(key => next[key as keyof WorkoutState] === state[key as keyof WorkoutState])) return false;
    this.current = Object.freeze(next);
    this.version++;
    // A local gesture settling back to its exercise does not invalidate speech in flight.
    if (action.type !== 'elapsed' && !(action.type === 'coach' && next.coachCue === state.coachCue)) this.coachVersion++;
    this.changed(this.current);
    return true;
  }
}
