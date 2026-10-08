import { WorkoutSession, sessionStages } from '../shared/workout/session.js';
import { isTimedPhase } from '../shared/workout/state.js';
import { TimerLedger } from '../shared/openui/timer-store.js';
import { serializeStatement } from '../shared/openui/serialize.js';
import { validateProgram } from '../shared/openui/validate.js';
import type { StatementNode } from '../shared/openui/openui-model.js';
import type { Conversation } from '../shared/controller.js';
import { renderComponent, trainerViews, type Context } from './components.js';
import { byId, el } from './dom.js';
import { GeminiLiveCoach } from './gemini-live-client.js';

export function mountSession(conversation: Conversation, liveSend: (text: string) => Promise<void>): () => void {
  const session = new WorkoutSession(conversation.workout, () => performance.now());
  const context: Context = { workout: conversation.workout, send: text => session.respond(text), timers: new TimerLedger(), timerAction: () => {}, updates: [], paused: false };
  let trainer: HTMLElement | undefined;
  let previousKey = '', previousCue = '', previousStage = -1;
  const phases = byId('session-path');
  for (const [index, stage] of sessionStages.entries()) {
    const item = el('li'); item.append(el('span', String(index + 1).padStart(2, '0'), 'step-number'), el('span', stage.phase === 'active' ? `Block ${index === 3 ? 1 : index === 6 ? 2 : 3}` : stage.phase === 'checkin' ? 'Check-in' : stage.phase === 'complete' ? 'Complete' : stage.phase)); phases.append(item);
  }
  const update = () => {
    const state = conversation.workout.state;
    voice.sendWorkoutContext();
    const key = JSON.stringify([conversation.workout.revision, session.index, conversation.provider, conversation.pending, conversation.error, conversation.consent, voice.feedbackLabel]);
    if (key === previousKey) return;
    previousKey = key;
    const code = ['root = Screens([sessionScreen])', 'sessionScreen = Screen([trainer, progress, coach])',
      serializeStatement('trainer', 'Trainer', [state.trainerAnimation, 'AiRA, your animated coach']),
      serializeStatement('progress', 'Progress', [session.progress, 'Session progress']),
      serializeStatement('coach', 'CoachPanel', [state.coachCue, state.phase])].join('\n');
    const screen = (validateProgram(code).props.screens as StatementNode[])[0];
    const nodes = screen.props.children as StatementNode[];
    if (!trainer) { trainer = renderComponent(nodes[0], context); byId('trainer-mount').append(trainer); }
    trainerViews.get(trainer)?.update(state.trainerAnimation, state.paused);
    const progress = byId('session-progress');
    if (!progress.childNodes.length) progress.append(renderComponent(nodes[1], context));
    else {
      const percent = Math.round(session.progress * 100);
      progress.querySelector('.progress-fill')!.setAttribute('style', `width: ${session.progress * 100}%`);
      progress.querySelector('[role=progressbar]')!.setAttribute('aria-valuenow', String(percent));
      progress.querySelector('.session-progress')!.children[1].textContent = `${percent}%`;
    }
    if (previousCue !== state.coachCue || previousStage !== session.index) {
      byId('session-coach').replaceChildren(renderComponent(nodes[2], context)); previousCue = state.coachCue;
    }
    if (previousStage !== session.index && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      byId('session-title').animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 350, easing: 'ease-out' });
      if (previousStage >= 0) byId('session-timer').animate([{ opacity: 0.4, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
    }
    previousStage = session.index;
    byId('session-title').textContent = session.stage.title;
    const phaseLabel = session.stage.phase === 'active' ? `Block ${session.index === 3 ? '01' : session.index === 6 ? '02' : '03'} / 03` : session.stage.phase.replace('checkin', 'check-in');
    if (byId('session-phase').textContent !== phaseLabel) byId('session-phase').textContent = phaseLabel;
    byId('movement').textContent = state.movementLabel ?? (state.phase === 'complete' ? 'A little stronger in spirit.' : 'Full-body flow');
    byId('session-timer').textContent = isTimedPhase(state.phase) ? `${Math.floor(session.remaining / 60).toString().padStart(2, '0')}:${(session.remaining % 60).toString().padStart(2, '0')}` : state.phase === 'complete' ? '✓' : state.phase === 'intro' ? '03:35' : '—';
    byId('timer-caption').textContent = state.paused ? 'Paused · your place is saved' : isTimedPhase(state.phase) ? 'Time remaining' : state.phase === 'complete' ? 'Session complete' : state.phase === 'intro' ? 'A short session. A fresh start.' : 'Choose your pace · the timer can wait';
    const next = byId<HTMLButtonElement>('session-next'); next.textContent = state.phase === 'intro' ? 'Let’s begin ↗' : state.phase === 'checkin' ? 'Start warm-up ↗' : state.phase === 'adaptation' ? 'On to block 2 ↗' : state.phase === 'complete' ? 'Explore again ↗' : 'Next step →';
    const pause = byId<HTMLButtonElement>('session-pause'); pause.hidden = !isTimedPhase(state.phase); pause.textContent = state.paused ? '▶ Resume' : 'Ⅱ Pause';
    byId('energy-options').hidden = state.phase !== 'checkin' && state.phase !== 'adaptation';
    byId('session-difficulty').textContent = state.difficulty === 'easy' ? 'Gentle pace' : state.difficulty === 'challenging' ? 'Challenging pace' : 'Steady pace';
    for (const item of Array.from(phases.children)) { const index = Array.from(phases.children).indexOf(item); item.classList.toggle('current', index === session.index); item.classList.toggle('done', index < session.index); if (index === session.index) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current'); }
    const runtimeLabel = voice.feedbackLabel || (conversation.pending ? 'AiRA is thinking…' : conversation.provider === 'mock' ? 'AiRA is here · text coaching' : conversation.consent ? 'AiRA is ready · send a message' : 'Text coach · agree to usage in settings');
    if (byId('coach-runtime').textContent !== runtimeLabel) byId('coach-runtime').textContent = runtimeLabel;
    byId('coach-composer').setAttribute('aria-busy', String(conversation.pending));
    byId('coach-feedback').textContent = conversation.error;
    byId('coach-feedback').hidden = !conversation.error;
    byId('coach-cancel').hidden = !conversation.pending;
    byId('coach-retry').hidden = !conversation.error;
    if (state.phase === 'complete' && (document.activeElement === byId('coach-input') || document.activeElement === byId('coach-send'))) byId('session-next').focus();
    byId<HTMLInputElement>('coach-input').disabled = state.phase === 'complete';
    byId<HTMLButtonElement>('coach-send').disabled = state.phase === 'complete' || !byId<HTMLInputElement>('coach-input').value.trim();
    for (const [id, difficulty] of [['energy-gentle', 'easy'], ['energy-steady', 'moderate']]) byId(id).setAttribute('aria-pressed', String(state.difficulty === difficulty));
  };
  // A double click or held key must not skip an authored stage.
  byId('session-next').addEventListener('click', event => { if (event.detail > 1) return; if (session.stage.phase === 'complete') session.reset(); else session.next(); update(); });
  for (const button of ['session-next', 'session-pause', 'session-restart']) byId(button).addEventListener('keydown', event => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); });
  byId('session-pause').addEventListener('click', event => { if (event.detail > 1) return; session.pause(!conversation.workout.state.paused); update(); });
  byId('session-restart').addEventListener('click', event => { if (event.detail > 1) return; session.reset(); update(); });
  byId('energy-gentle').addEventListener('click', () => { session.chooseDifficulty('easy'); update(); });
  byId('energy-steady').addEventListener('click', () => { session.chooseDifficulty('moderate'); update(); });
  const voice = new GeminiLiveCoach(session, () => update());
  byId('coach-input').addEventListener('input', () => { byId<HTMLButtonElement>('coach-send').disabled = session.stage.phase === 'complete' || !byId<HTMLInputElement>('coach-input').value.trim(); });
  byId('coach-cancel').addEventListener('click', () => conversation.cancel());
  byId('coach-retry').addEventListener('click', () => { const message = conversation.messages.at(-1); if (message?.role === 'user') void liveSend(message.content); });
  byId<HTMLFormElement>('coach-composer').addEventListener('submit', event => {
    event.preventDefault(); const input = byId<HTMLInputElement>('coach-input'), text = input.value.trim();
    if (!text) return; input.value = ''; byId('last-coach-input').textContent = `You: ${text}`;
    if (voice.sendText(text)) { if (conversation.pending) conversation.cancel('interrupted'); }
    else if (conversation.provider === 'mock' || session.handlesText(text)) { if (conversation.pending) conversation.cancel('interrupted'); session.respond(text); update(); }
    else void liveSend(text);
  });
  // The secondary fixture reset shares Conversation's reset; keep the authored plan aligned.
  byId('reset').addEventListener('click', () => { session.reset(); update(); });
  setInterval(() => { session.tick(); update(); }, 250);
  window.addEventListener('pagehide', () => { if (trainer) trainerViews.get(trainer)?.dispose(); });
  update(); return update;
}
