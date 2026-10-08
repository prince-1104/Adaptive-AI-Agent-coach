import { valid, type Schema } from '../schema.js';
import { animationSchema, difficultySchema, durationSchema, workoutPhases, type TrainerAnimation, type WorkoutDifficulty, type WorkoutPhase } from './state.js';

export type VoiceUpdate = { phase?: WorkoutPhase; difficulty?: WorkoutDifficulty; durationSeconds?: number; trainerAnimation?: TrainerAnimation; coachCue?: string };
const fields: Record<string, Schema> = {
  phase: { type: 'string', enum: [...workoutPhases] }, difficulty: difficultySchema,
  durationSeconds: durationSchema, trainerAnimation: animationSchema,
  coachCue: { type: 'string', minLength: 1, maxLength: 1200 },
};
export function isVoiceUpdate(value: unknown): value is VoiceUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, field]) => Object.hasOwn(fields, key) && valid(fields[key], field));
}
