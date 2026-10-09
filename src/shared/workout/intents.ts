import { workoutDifficulties, type WorkoutDifficulty } from './state.js';

export const workoutIntentNames = ['pause_workout', 'resume_workout', 'repeat_current_block', 'skip_current_block', 'request_recovery', 'set_difficulty', 'end_workout', 'advance_workout', 'describe_next', 'restart_workout'] as const;
export type WorkoutIntent = { action: Exclude<typeof workoutIntentNames[number], 'set_difficulty'> } | { action: 'set_difficulty'; difficulty: WorkoutDifficulty };

/** Shared closed action boundary for UI, offline language and Gemini tools. */
export function isWorkoutIntent(value: unknown): value is WorkoutIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!workoutIntentNames.includes(v.action as typeof workoutIntentNames[number])) return false;
  return v.action === 'set_difficulty'
    ? Object.keys(v).length === 2 && workoutDifficulties.includes(v.difficulty as WorkoutDifficulty)
    : Object.keys(v).length === 1;
}

/** Conservative natural-language fallback; unknown wording can still be interpreted by Gemini. */
export function interpretWorkoutText(text: string): WorkoutIntent | null {
  const t = text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(don't|do not|never)\b/.test(t)) return null;
  if (/\b(restart|reset|start (over|again))\b/.test(t)) return { action: 'restart_workout' };
  if (/\b(what|which)\b.*\b(next|coming up)\b/.test(t)) return { action: 'describe_next' };
  if (/\b(pain|injury|injured|dizzy|dizziness)\b/.test(t)) return { action: 'end_workout' };
  if (/\b(pause|hold on|wait|stop for (a|one) (second|moment|minute))\b/.test(t)) return { action: 'pause_workout' };
  if (/\b(i'm done|i am done|im done|end (the |this |my )?(workout|session)|finish|i want to stop|stop (the |this |my )?(workout|session))\b/.test(t)) return { action: 'end_workout' };
  if (/\bstop\b/.test(t)) return { action: 'pause_workout' };
  if (/\b(repeat|again|one more)\b/.test(t)) return { action: 'repeat_current_block' };
  if (/\b(break|rest|recover|recovery|tired|killing me)\b/.test(t)) return { action: 'request_recovery' };
  if (/\b(easier|too hard|too difficult|slow down|slower|reduce the intensity|gentle|low energy)\b/.test(t)) return { action: 'set_difficulty', difficulty: 'easy' };
  if (/\b(harder|too easy|push me|increase the intensity)\b/.test(t)) return { action: 'set_difficulty', difficulty: 'challenging' };
  if (/\b(steady|moderate|energized)\b/.test(t)) return { action: 'set_difficulty', difficulty: 'moderate' };
  if (/\b(resume|continue)\b/.test(t)) return { action: 'resume_workout' };
  if (/\b(skip|next|move on)\b/.test(t)) return { action: 'skip_current_block' };
  if (/\b(start|ready|let's go|lets go|begin)\b/.test(t)) return { action: 'advance_workout' };
  return null;
}
