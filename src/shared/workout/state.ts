import { obj, str, valid, type Schema } from '../schema.js';

export const workoutPhases = ['intro', 'checkin', 'warmup', 'active', 'recovery', 'adaptation', 'complete'] as const;
export const trainerAnimations = ['idle', 'greet', 'ready', 'demonstrate', 'active', 'encourage', 'recover', 'celebrate'] as const;
export const workoutDifficulties = ['easy', 'moderate', 'challenging'] as const;
export type WorkoutPhase = typeof workoutPhases[number];
export type TrainerAnimation = typeof trainerAnimations[number];
export type WorkoutDifficulty = typeof workoutDifficulties[number];

/** Synthetic phase progress, never evidence of physical exercise. */
export type WorkoutState = Readonly<{
  phase: WorkoutPhase;
  movementLabel: string | null;
  durationSeconds: number;
  difficulty: WorkoutDifficulty;
  progress: number;
  coachCue: string;
  trainerAnimation: TrainerAnimation;
  elapsedSeconds: number;
  paused: boolean;
}>;

export const durationSchema: Schema = { type: 'integer', minimum: 0, maximum: 3600 };
export const difficultySchema: Schema = { type: 'string', enum: [...workoutDifficulties] };
export const animationSchema: Schema = { type: 'string', enum: [...trainerAnimations] };
export const movementSchema: Schema = { anyOf: [str(120), { type: 'null' }] };
const fieldsSchema = obj({
  phase: { type: 'string', enum: [...workoutPhases] }, movementLabel: movementSchema,
  durationSeconds: durationSchema, difficulty: difficultySchema, coachCue: str(1200),
  trainerAnimation: animationSchema, elapsedSeconds: durationSchema, paused: { type: 'boolean' },
});

export function isTimedPhase(phase: WorkoutPhase): boolean {
  return phase === 'warmup' || phase === 'active' || phase === 'recovery';
}

export function isWorkoutState(value: unknown): value is WorkoutState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { progress, ...fields } = value as Record<string, unknown>;
  if (!valid(fieldsSchema, fields)) return false;
  const state = fields as Omit<WorkoutState, 'progress'>;
  if (isTimedPhase(state.phase)) {
    if (state.durationSeconds === 0 || state.movementLabel === null) return false;
  } else if (state.durationSeconds !== 0 || state.elapsedSeconds !== 0 || state.movementLabel !== null || state.paused) return false;
  if (state.elapsedSeconds > state.durationSeconds) return false;
  const expected = state.phase === 'complete' ? 1 : state.durationSeconds ? state.elapsedSeconds / state.durationSeconds : 0;
  return typeof progress === 'number' && Number.isFinite(progress) && progress === expected;
}

export function initialWorkoutState(): WorkoutState {
  return Object.freeze({ phase: 'intro', movementLabel: null, durationSeconds: 0, difficulty: 'moderate',
    progress: 0, coachCue: 'Welcome to AiRA. This is a fictional workout preview.',
    trainerAnimation: 'idle', elapsedSeconds: 0, paused: false });
}
