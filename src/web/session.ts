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
  const history = byId('coach-history');
  const recordMessage = (speaker: 'AiRA' | 'You', text: string, transcriptId?: string) => {
    const follow = history.scrollHeight - history.scrollTop - history.clientHeight < 80;
    const existing = transcriptId ? Array.from(history.children).find(node => (node as HTMLElement).dataset.transcriptId === transcriptId) : undefined;
    if (existing) { existing.querySelector('p')!.textContent = text; if (follow) history.scrollTop = history.scrollHeight; return; }
    // A local cue appears immediately; adopt that bubble when its spoken transcript arrives.
    // Never merge different voice IDs: repeating a phrase in a later turn is intentional.
    const last = history.lastElementChild as HTMLElement | null;
    const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
    const lastText = normalize(last?.querySelector('p')?.textContent ?? ''), nextText = normalize(text);
    if (speaker === 'AiRA' && last?.classList.contains('chat-coach') && nextText && lastText) {
      if (transcriptId && !last.dataset.transcriptId && (lastText.startsWith(nextText) || nextText.startsWith(lastText))) {
        last.dataset.transcriptId = transcriptId; last.querySelector('p')!.textContent = text;
        if (follow) history.scrollTop = history.scrollHeight; return;
      }
      if (!transcriptId && last.dataset.transcriptId && lastText === nextText) return;
    }
    const bubble = el('div', undefined, `chat-message ${speaker === 'You' ? 'chat-user' : 'chat-coach'}`);
    if (transcriptId) bubble.dataset.transcriptId = transcriptId;
    bubble.append(el('span', speaker, 'chat-speaker'), el('p', text)); history.append(bubble);
    while (history.children.length > 40) history.firstElementChild?.remove();
    if (follow || speaker === 'You') history.scrollTop = history.scrollHeight;
  };
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
    if (!trainer) { trainer = renderComponent(nodes[0], context); byId('trainer-mount').append(trainer); trainerViews.get(trainer)?.setSpeechSource(() => voice.outputLevel); }
    trainerViews.get(trainer)?.update(state.trainerAnimation, state.paused, state.movementLabel);
    const progress = byId('session-progress');
    if (!progress.childNodes.length) progress.append(renderComponent(nodes[1], context));
    else {
      const percent = Math.round(session.progress * 100);
      progress.querySelector('.progress-fill')!.setAttribute('style', `width: ${session.progress * 100}%`);
      progress.querySelector('[role=progressbar]')!.setAttribute('aria-valuenow', String(percent));
      progress.querySelector('.session-progress')!.children[1].textContent = `${percent}%`;
    }
    if (previousCue !== state.coachCue || previousStage !== session.index) {
      if (session.index === 0 && previousStage > 0) history.replaceChildren();
      if (state.coachCue !== previousCue && !(state.phase === 'intro' && state.trainerAnimation === 'idle')) recordMessage('AiRA', state.coachCue);
      byId('session-coach').replaceChildren(renderComponent(nodes[2], context)); previousCue = state.coachCue;
    }
    if (previousStage !== session.index && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      byId('session-title').animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 350, easing: 'ease-out' });
      if (previousStage >= 0) byId('session-timer').animate([{ opacity: 0.4, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
    }
    previousStage = session.index;
    const finished = state.phase === 'complete' || state.phase === 'stopped';
    byId('session-status-label').textContent = state.paused ? 'Session paused' : finished ? state.phase === 'complete' ? 'Session complete' : 'Session ended' : ['active', 'warmup', 'recovery'].includes(state.phase) ? 'Session in progress' : 'Session ready';
    byId('trainer-name').textContent = state.phase === 'intro' ? 'Meet AiRA.' : state.paused ? 'Take your time.' : state.phase === 'complete' ? 'That’s your moment.' : state.phase === 'stopped' ? 'Here when you’re ready.' : 'With you, every rep.';
    byId('session-title').textContent = state.paused ? 'Session paused.' : state.phase === 'stopped' ? 'Session ended.' : state.movementLabel?.split(' · ')[0] ?? session.stage.title;
    const phaseLabel = session.stage.phase === 'active' ? `Block ${session.index === 3 ? '01' : session.index === 6 ? '02' : '03'} / 03` : session.stage.phase.replace('checkin', 'check-in');
    if (byId('session-phase').textContent !== phaseLabel) byId('session-phase').textContent = phaseLabel;
    byId('movement').textContent = state.paused ? 'Your place is saved. Continue when you’re ready.' : state.phase === 'stopped' ? 'A fresh start is here whenever you need it.' : state.movementLabel ? session.stage.title : state.phase === 'complete' ? session.summary : 'Full-body flow';
    byId('session-timer').textContent = isTimedPhase(state.phase) ? `${Math.floor(session.remaining / 60).toString().padStart(2, '0')}:${(session.remaining % 60).toString().padStart(2, '0')}` : state.phase === 'complete' ? '✓' : state.phase === 'intro' ? '03:35' : '—';
    byId('timer-caption').textContent = state.paused ? 'Paused · your place is saved' : isTimedPhase(state.phase) ? 'Time remaining' : finished ? state.phase === 'complete' ? 'Session complete' : 'Session ended' : state.phase === 'intro' ? 'A short session. A fresh start.' : 'Choose your pace · the timer can wait';
    const next = byId<HTMLButtonElement>('session-next'); next.hidden = state.paused; next.textContent = state.phase === 'intro' ? 'Let’s begin ↗' : state.phase === 'checkin' ? 'Start warm-up ↗' : state.phase === 'recovery' ? 'Ready · continue →' : state.phase === 'adaptation' ? 'On to block 2 ↗' : finished ? 'Start again ↗' : 'Next step →';
    const pause = byId<HTMLButtonElement>('session-pause'); pause.hidden = finished || state.phase === 'intro'; pause.textContent = state.paused ? '▶ Resume' : 'Ⅱ Pause';
    byId('session-end').hidden = finished || state.phase === 'intro';
    byId('session-restart').hidden = !finished && state.phase !== 'intro';
    const adaptation = byId('session-adaptation'), nextBlock = session.nextBlock;
    adaptation.hidden = !state.adaptedFrom || state.adaptedFrom === state.difficulty || finished;
    const pace = (value: string) => value === 'moderate' ? 'Steady' : value === 'easy' ? 'Easy' : 'Challenging';
    adaptation.textContent = adaptation.hidden ? '' : `Session adapted · ${pace(state.adaptedFrom!)} → ${pace(state.difficulty)}${nextBlock ? ` · Next block: ${session.secondsAtPace(nextBlock.seconds, state.adaptedFrom!)}s → ${session.nextBlockDuration}s` : ''}`;
    byId('session-plan').hidden = state.phase !== 'checkin';
    byId('session-plan').textContent = `Your plan · ${sessionStages.filter(stage => stage.phase === 'active').map(stage => `${stage.movement!.split(' · ')[0]} ${session.secondsAtPace(stage.seconds)}s`).join(' · ')}`;
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
    if (finished && (document.activeElement === byId('coach-input') || document.activeElement === byId('coach-send'))) byId('session-next').focus();
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-coach-message]')) button.disabled = finished;
    byId<HTMLInputElement>('coach-input').disabled = finished;
    byId<HTMLButtonElement>('coach-send').disabled = finished || !byId<HTMLInputElement>('coach-input').value.trim();
    for (const [id, difficulty] of [['energy-gentle', 'easy'], ['energy-steady', 'moderate']]) byId(id).setAttribute('aria-pressed', String(state.difficulty === difficulty));
  };
  // A double click or held key must not skip an authored stage.
  byId('session-next').addEventListener('click', event => { if (event.detail > 1) return; session.applyIntent({ action: ['complete', 'stopped'].includes(session.stage.phase) ? 'restart_workout' : 'advance_workout' }); update(); });
  for (const button of ['session-next', 'session-pause', 'session-restart', 'session-end']) byId(button).addEventListener('keydown', event => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); });
  byId('session-pause').addEventListener('click', event => { if (event.detail > 1) return; session.applyIntent({ action: conversation.workout.state.paused ? 'resume_workout' : 'pause_workout' }); update(); });
  byId('session-end').addEventListener('click', event => { if (event.detail > 1) return; conversation.cancel(); session.applyIntent({ action: 'end_workout' }); update(); });
  byId('session-restart').addEventListener('click', event => { if (event.detail > 1) return; session.applyIntent({ action: 'restart_workout' }); update(); });
  byId('energy-gentle').addEventListener('click', () => { session.chooseDifficulty('easy'); update(); });
  byId('energy-steady').addEventListener('click', () => { session.chooseDifficulty('moderate'); update(); });
  const voice = new GeminiLiveCoach(session, () => update(), recordMessage);
  byId('coach-input').addEventListener('input', () => { byId<HTMLButtonElement>('coach-send').disabled = session.stage.phase === 'complete' || !byId<HTMLInputElement>('coach-input').value.trim(); });
  byId('coach-cancel').addEventListener('click', () => conversation.cancel());
  byId('coach-retry').addEventListener('click', () => { const message = conversation.messages.at(-1); if (message?.role === 'user') void liveSend(message.content); });
  byId<HTMLFormElement>('coach-composer').addEventListener('submit', event => {
    event.preventDefault(); const input = byId<HTMLInputElement>('coach-input'), text = input.value.trim();
    if (!text) return; input.value = ''; byId('last-coach-input').textContent = `You: ${text}`;
    if (voice.sendText(text)) { if (conversation.pending) conversation.cancel('interrupted'); }
    else {
      recordMessage('You', text);
      if (conversation.provider === 'mock' || session.handlesText(text)) { if (conversation.pending) conversation.cancel('interrupted'); session.respond(text); update(); }
      else void liveSend(text);
    }
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-coach-message]')) button.addEventListener('click', () => {
    const input = byId<HTMLInputElement>('coach-input');
    if (input.disabled) return;
    input.value = button.dataset.coachMessage ?? '';
    byId<HTMLFormElement>('coach-composer').requestSubmit(); input.focus({ preventScroll: true });
  });
  // The secondary fixture reset shares Conversation's reset; keep the authored plan aligned.
  byId('reset').addEventListener('click', () => { session.reset(); update(); });
  setInterval(() => {
    const phase = conversation.workout.state.phase, cue = conversation.workout.state.coachCue;
    session.tick();
    if (phase !== conversation.workout.state.phase || (conversation.workout.state.phase === 'recovery' && cue !== conversation.workout.state.coachCue)) voice.queueTimerGuidance();
    update(); voice.flushTimerGuidance();
  }, 250);
  window.addEventListener('pagehide', () => { if (trainer) trainerViews.get(trainer)?.dispose(); });
  update(); return update;
}
