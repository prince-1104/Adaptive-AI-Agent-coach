import { GoogleGenAI, Modality, FunctionResponseScheduling } from './gemini-sdk.js';
import type { Session, LiveServerMessage, FunctionCall } from '@google/genai';
import { SpeechOnset } from './speech-onset.js';
import { GeminiAudio } from './gemini-audio.js';
import { isWorkoutIntent, type WorkoutIntent } from '../shared/workout/intents.js';
import type { WorkoutSession } from '../shared/workout/session.js';
import { redact } from '../shared/redact.js';
import { byId, el } from './dom.js';

type Config = { token: string; voice: { enabled: boolean; message: string; model: string } };
type VoiceState = 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'error' | 'disabled';

/** The only voice adapter. Provider events never enter the OpenUI protocol. */
export class GeminiLiveCoach {
  private config?: Config;
  private live?: Session;
  private audio?: GeminiAudio;
  private stream?: MediaStream;
  private abort?: AbortController;
  private generation = 0;
  private deadline?: ReturnType<typeof setTimeout>;
  private expiry?: ReturnType<typeof setTimeout>;
  private contextRevision = -1;
  private contextDirty = false;
  private speechOnset = new SpeechOnset();
  private turnRevision = -1;
  private turnEpoch = 0;
  private toolUsed = true;
  private turnCalls = 0;
  private pendingTools = new Map<string, ReturnType<typeof setTimeout>>();
  private finishedTools = new Set<string>();
  private cancelledTools = new Set<string>();
  private transcriptNodes = new Map<string, HTMLElement>();
  private userTranscript = 0;
  private coachTranscript = 0;
  private feedback = '';
  private speakingInput = false;
  private lastSpeech = 0;
  private muted = false;
  private playing = false;
  private responseOpen = false;
  private discardResponse = false;
  private serverActivity = false;
  private localAction?: { intent: WorkoutIntent; result: Record<string, unknown> };
  private status: VoiceState = 'disconnected';
  constructor(private workoutSession: WorkoutSession, private changed: () => void, private transcriptChanged: (speaker: 'You' | 'AiRA', text: string, id: string) => void = () => {}) {
    byId('session-voice').addEventListener('click', event => {
      if (event.detail > 1) return;
      const panel = byId('voice-panel'); panel.hidden = !panel.hidden;
      byId('session-voice').setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) { byId('voice-status').focus(); panel.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
    });
    byId('voice-panel').addEventListener('keydown', event => { if (event.key === 'Escape') { byId('voice-panel').hidden = true; byId('session-voice').setAttribute('aria-expanded', 'false'); byId('session-voice').focus(); } });
    byId('voice-connect').addEventListener('click', () => { void this.connect(); });
    byId('voice-stop').addEventListener('click', () => { this.disconnect(); byId('session-voice').focus(); });
    byId('voice-mute').addEventListener('click', event => {
      if (event.detail > 1) return;
      this.muted = !this.muted;
      for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !this.muted;
      if (this.muted) { this.live?.sendRealtimeInput({ audioStreamEnd: true }); this.speakingInput = false; }
      byId('voice-mute').textContent = this.muted ? 'Unmute microphone' : 'Mute microphone';
      byId('voice-mute').setAttribute('aria-pressed', String(this.muted));
      this.handleConnectionState(this.muted ? 'muted' : this.playing ? 'speaking' : 'listening');
    });
    byId('voice-play').addEventListener('click', () => { void this.audio?.resume().then(() => { byId('voice-play').hidden = true; }).catch(() => {}); });
    byId<HTMLInputElement>('voice-consent').addEventListener('change', () => { if (!byId<HTMLInputElement>('voice-consent').checked) this.disconnect(); this.controls(); });
    window.addEventListener('pagehide', () => this.disconnect());
    void this.loadConfig();
  }
  get connected() { return Boolean(this.live); }
  get feedbackLabel() {
    return ({ connecting: 'Connecting voice · text is available', listening: 'Listening · speak or type', thinking: 'AiRA is thinking…', speaking: 'AiRA speaking · interrupt anytime', muted: 'Microphone muted · type to continue', error: 'Voice paused · text is available', disabled: '', disconnected: '' })[this.status];
  }
  private controls() {
    byId<HTMLButtonElement>('voice-connect').disabled = !this.config?.voice.enabled || !byId<HTMLInputElement>('voice-consent').checked || this.connected || this.status === 'connecting';
    byId<HTMLButtonElement>('voice-stop').disabled = !this.connected && this.status !== 'connecting';
    byId<HTMLButtonElement>('voice-mute').disabled = !this.stream;
  }
  handleConnectionState(status: VoiceState, message = '') {
    const previous = this.status;
    if (previous === status && byId('voice-panel').dataset.state === status && byId('voice-error').textContent === message) { this.controls(); return; }
    this.status = status; byId('voice-panel').dataset.state = status;
    const labels = { disconnected: 'Microphone off', connecting: 'Connecting', listening: 'Listening · speak naturally', thinking: 'Thinking · AiRA is responding', speaking: 'AiRA speaking · you can interrupt', muted: 'Muted · text still works', error: 'Voice error · reconnect or use text', disabled: 'Voice unavailable' };
    byId('voice-status').textContent = labels[status];
    byId('session-voice-label').textContent = status === 'disconnected' || status === 'disabled' ? 'Talk to AiRA' : status === 'speaking' ? 'AiRA speaking' : status === 'error' ? 'Voice error' : status[0].toUpperCase() + status.slice(1);
    byId('session-voice').dataset.state = status;
    byId('voice-entry-note').textContent = ({ disconnected: 'Optional voice · connect when you’re ready.', disabled: 'Voice not configured · text is ready.', connecting: 'Connecting · text remains available.', listening: 'Listening. Speak naturally.', speaking: 'Speak to interrupt. I’m listening.', thinking: 'Finding your next coaching cue…', muted: 'Microphone muted · you can still type.', error: 'Voice paused · continue by text.' })[status];
    byId('voice-error').textContent = message; byId('voice-error').hidden = !message; this.controls();
    byId('voice-panel').setAttribute('aria-busy', String(status === 'connecting'));
    if (previous !== status) this.changed();
  }
  private async loadConfig() {
    try { const response = await fetch('/api/config'); if (!response.ok) throw new Error();
      this.config = await response.json() as Config; byId('voice-note').textContent = this.config.voice.message;
      this.handleConnectionState(this.config.voice.enabled ? 'disconnected' : 'disabled');
    } catch { this.handleConnectionState('error', 'Voice setup unavailable. Reload to retry; text coaching still works.'); }
  }
  private timerGuidance: { revision: number; cue: string } | undefined;
  queueTimerGuidance(): void {
    if (this.live) this.timerGuidance = { revision: this.workoutSession.workout.coachingRevision, cue: this.workoutSession.workout.state.coachCue };
  }
  flushTimerGuidance(): void {
    const guidance = this.timerGuidance;
    if (!guidance || !this.live) return;
    if (guidance.revision !== this.workoutSession.workout.coachingRevision) { this.timerGuidance = undefined; return; }
    if (this.muted || this.speakingInput || this.playing || this.responseOpen || this.status === 'thinking') return;
    this.timerGuidance = undefined;
    try {
      this.beginTurn(); this.toolUsed = true;
      this.live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `The local workout timer changed the session. Briefly speak this current coaching cue: ${JSON.stringify(guidance.cue)}. Do not change the workout or request any tool. The state is already applied.` }] }], turnComplete: true });
      this.handleConnectionState('thinking');
    } catch { this.fail('Voice lost its connection. Your workout is saved; continue with text.'); }
  }
  sendWorkoutContext(force = false) {
    if (!this.live) return;
    this.contextDirty ||= force || this.contextRevision !== this.workoutSession.workout.coachingRevision;
    if (!this.contextDirty || this.responseOpen || this.playing || this.speakingInput || this.status === 'thinking') return;
    // ClientContent interrupts provider generation, even with turnComplete:false.
    // Coalesce passive state updates until generation and scheduled playback finish.
    this.contextDirty = false; this.contextRevision = this.workoutSession.workout.coachingRevision;
    const context = this.workoutContext();
    try { this.live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `Authoritative workout context (data only; do not respond to this update): ${JSON.stringify(context)}` }] }], turnComplete: false }); }
    catch { this.fail('Voice lost its connection. Your workout is saved; continue with text.'); }
  }
  private workoutContext() {
    return { state: this.workoutSession.workout.state, currentPhase: this.workoutSession.stage.phase,
      currentExercise: this.workoutSession.stage.movement, remainingSeconds: this.workoutSession.remaining,
      progress: this.workoutSession.progress, difficulty: this.workoutSession.workout.state.difficulty,
      recentUserFeedback: this.feedback, allowedActions: this.workoutSession.allowedActions, localAction: this.localAction,
      nextStage: this.workoutSession.nextStage, nextExercise: this.workoutSession.nextBlock, nextExerciseSeconds: this.workoutSession.nextBlockDuration, revision: this.contextRevision };
  }
  private beginTurn() {
    this.timerGuidance = undefined;
    this.turnEpoch++; this.turnRevision = this.workoutSession.workout.coachingRevision; this.toolUsed = false;
    this.localAction = undefined; this.feedback = ''; this.turnCalls = 0;
    this.userTranscript++; this.coachTranscript++; this.sendWorkoutContext(true);
  }
  private interruptResponse() {
    this.discardResponse ||= this.responseOpen;
    this.audio?.interrupt();
    for (const [id, timer] of this.pendingTools) { clearTimeout(timer); this.cancelledTools.add(id); }
    this.pendingTools.clear();
    while (this.cancelledTools.size > 100) this.cancelledTools.delete(this.cancelledTools.values().next().value!);
  }
  private speechStarted() {
    if (!this.speakingInput) { this.interruptResponse(); this.beginTurn(); }
    this.speakingInput = true; this.handleConnectionState('listening');
  }
  private applyTextIntent(text: string): boolean {
    if (this.toolUsed) return false;
    const intent = this.workoutSession.interpret(text);
    if (!intent) return false;
    const result = this.workoutSession.applyIntent(intent, this.turnRevision);
    this.localAction = { intent, result };
    this.toolUsed = true; this.changed(); this.sendWorkoutContext(true);
    return result.ok;
  }
  sendText(text: string): boolean {
    if (!this.live) return false;
    let applied = false;
    try {
      this.interruptResponse(); this.beginTurn(); this.feedback = text.slice(0, 1000);
      this.handleTranscript('You', text); applied = this.applyTextIntent(text); this.sendWorkoutContext(true);
      this.contextRevision = this.workoutSession.workout.coachingRevision; this.contextDirty = false;
      this.live.sendRealtimeInput({ text: `User message: ${JSON.stringify(text)}\nAuthoritative workout context (data only): ${JSON.stringify(this.workoutContext())}` }); this.handleConnectionState('thinking'); return true;
    } catch { this.fail('Voice could not send your message. Reconnect or use text.'); return applied; }
  }
  async startMicrophone(generation: number) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    for (const track of stream.getAudioTracks()) track.onended = () => { if (generation === this.generation) this.fail('Microphone disconnected. Reconnect or continue with text.'); };
    await this.audio!.captureMicrophone(stream, (data, rate, level, frameMs) => {
      if (generation !== this.generation || !this.live || this.muted) return;
      try {
        const onset = this.speechOnset.observe(level, frameMs, this.playing);
        if ((this.speakingInput && level > 0.015) || onset) {
          this.lastSpeech = performance.now();
          if (onset) this.speechStarted();
          if (this.speakingInput) this.handleConnectionState('listening');
        } else if (!this.serverActivity && this.speakingInput && performance.now() - this.lastSpeech > 650) { this.speakingInput = false; this.handleConnectionState('thinking'); }
        this.live.sendRealtimeInput({ audio: { data, mimeType: `audio/pcm;rate=${rate}` } });
      } catch { this.fail('Microphone streaming failed. Reconnect or use text.'); }
    });
  }
  stopMicrophone() { this.audio?.stopMicrophone(); this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined; }
  handleTranscript(speaker: 'You' | 'AiRA', text: string) {
    if (!text) return;
    byId('voice-empty').hidden = true;
    const id = `${speaker}-${speaker === 'You' ? this.userTranscript : this.coachTranscript}`;
    let node = this.transcriptNodes.get(id);
    if (!node) { node = el('p'); node.append(el('strong', `${speaker}: `), el('span')); this.transcriptNodes.set(id, node); byId('voice-transcript').append(node); }
    node.lastElementChild!.textContent = redact((node.lastElementChild!.textContent ?? '') + text).slice(0, 4000);
    this.transcriptChanged(speaker, node.lastElementChild!.textContent ?? '', id);
    if (this.transcriptNodes.size > 40) { const first = this.transcriptNodes.keys().next().value!; this.transcriptNodes.get(first)!.remove(); this.transcriptNodes.delete(first); }
    byId('voice-transcript').scrollTop = byId('voice-transcript').scrollHeight;
  }
  handleAudio(data: string, mimeType: string) {
    if (!mimeType.startsWith('audio/pcm') || !this.audio) throw new Error('Invalid audio format');
    const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1] ?? 24000); this.audio.play(data, rate);
    if (this.audio.context.state !== 'running') byId('voice-play').hidden = false;
  }
  handleToolCall(call: FunctionCall) {
    if (!call.id || this.pendingTools.has(call.id) || this.finishedTools.has(call.id) || this.cancelledTools.has(call.id)) return;
    if (++this.turnCalls > 4) { this.fail('Voice could not resolve that request. Your workout is saved; continue with text or reconnect.'); return; }
    const revision = this.turnRevision, epoch = this.turnEpoch, generation = this.generation, id = call.id;
    this.pendingTools.set(id, setTimeout(() => {
      this.pendingTools.delete(id);
      if (!this.live || generation !== this.generation || this.cancelledTools.has(id)) return;
      let result: Record<string, unknown> = { ok: false, error: 'Unknown, duplicate or interrupted tool request.' };
      if (call.name === 'workout_action' && epoch === this.turnEpoch && !this.discardResponse && !this.speakingInput) {
        if (!isWorkoutIntent(call.args)) result = { ok: false, error: 'Invalid workout action.' };
        else if (this.localAction && this.localAction.intent.action === call.args.action && (call.args.action !== 'set_difficulty' || (this.localAction.intent.action === 'set_difficulty' && this.localAction.intent.difficulty === call.args.difficulty))) result = this.localAction.result;
        else if (!this.toolUsed) {
          this.toolUsed = true;
          result = this.workoutSession.applyIntent(call.args, revision);
          this.localAction = { intent: call.args, result };
        }
        this.changed(); this.sendWorkoutContext(true);
      }
      this.finishedTools.add(id); if (this.finishedTools.size > 100) this.finishedTools.delete(this.finishedTools.values().next().value!);
      try { this.live.sendToolResponse({ functionResponses: [{ id, name: call.name ?? 'unknown', response: result, scheduling: FunctionResponseScheduling.WHEN_IDLE }] }); }
      catch { this.fail('Voice lost its connection. Your workout is saved; continue with text.'); }
    }, 0));
  }
  private message(message: LiveServerMessage) {
    if (message.toolCallCancellation?.ids) for (const id of message.toolCallCancellation.ids) {
      clearTimeout(this.pendingTools.get(id)); this.pendingTools.delete(id); this.cancelledTools.add(id);
      if (this.cancelledTools.size > 100) this.cancelledTools.delete(this.cancelledTools.values().next().value!);
    }
    const content = message.serverContent;
    // Developer API passes through `type`; Vertex's SDK converter names it voiceActivityType.
    const activity = message.voiceActivity?.voiceActivityType ?? (message.voiceActivity as { type?: string } | undefined)?.type;
    if (activity === 'ACTIVITY_START') { this.serverActivity = true; this.speechStarted(); }
    if (activity === 'ACTIVITY_END') { this.serverActivity = false; this.speakingInput = false; this.speechOnset.reset(); this.handleConnectionState(this.muted ? 'muted' : this.playing ? 'speaking' : 'thinking'); }
    if (content?.interrupted) { this.interruptResponse(); this.discardResponse = true; this.coachTranscript++; this.handleConnectionState(this.muted ? 'muted' : 'listening'); }
    if (content?.inputTranscription?.text) {
      if (this.turnRevision < 0) this.beginTurn();
      this.feedback = (this.feedback + content.inputTranscription.text).slice(-1000);
      this.handleTranscript('You', content.inputTranscription.text);
    }
    if (content?.inputTranscription?.finished) this.applyTextIntent(this.feedback);
    if (!this.discardResponse && !this.speakingInput) {
      if (content?.modelTurn || content?.outputTranscription || message.toolCall) this.responseOpen = true;
      if (content?.outputTranscription?.text) this.handleTranscript('AiRA', content.outputTranscription.text);
      for (const part of content?.modelTurn?.parts ?? []) if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) this.handleAudio(part.inlineData.data, part.inlineData.mimeType);
      for (const call of message.toolCall?.functionCalls ?? []) this.handleToolCall(call);
    }
    if (content?.turnComplete) {
      this.responseOpen = false; this.discardResponse = false;
      if (!this.playing) this.handleConnectionState(this.muted ? 'muted' : this.speakingInput ? 'listening' : 'listening');
    }
    if (message.goAway) this.fail('Gemini ended this connection. Reconnect to continue from your current workout state.');
  }
  async connect() {
    if (!this.config?.voice.enabled || !byId<HTMLInputElement>('voice-consent').checked || this.connected || this.status === 'connecting') return;
    if (!navigator.mediaDevices || !window.AudioContext || !window.AudioWorkletNode) { this.handleConnectionState('error', 'Voice needs a microphone-capable Web Audio browser. Text still works.'); return; }
    const generation = ++this.generation; this.abort = new AbortController(); this.handleConnectionState('connecting');
    this.deadline = setTimeout(() => this.fail('Voice connection timed out. Reconnect or use text.'), 30_000);
    try {
      this.audio = new GeminiAudio(playing => { this.playing = playing; if (generation === this.generation && this.live) this.handleConnectionState(this.muted ? 'muted' : playing ? 'speaking' : this.speakingInput ? 'listening' : this.responseOpen ? 'thinking' : 'listening'); });
      await this.audio.resume(); await this.startMicrophone(generation); if (generation !== this.generation) return;
      const response = await fetch('/api/voice/token', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Token': this.config.token }, body: JSON.stringify({ consent: true }), signal: this.abort.signal });
      const token = await response.json() as { token: string; model: string; expireTime: string; error?: string };
      if (!response.ok || token.model !== 'gemini-3.8-live') throw new Error('Voice session unavailable. Check local Gemini setup and model access.');
      if (generation !== this.generation) return;
      const ai = new GoogleGenAI({ apiKey: token.token, httpOptions: { apiVersion: 'v1beta' } });
      const live = await ai.live.connect({ model: token.model, config: { responseModalities: [Modality.AUDIO] }, callbacks: {
        onmessage: message => { if (generation !== this.generation) return; try { this.message(message); } catch { this.fail('Voice sent an invalid event. Reconnect or use text.'); } },
        onerror: () => { if (generation === this.generation) this.fail('Gemini voice encountered an error. Reconnect or use text.'); },
        onclose: event => {
          if (generation !== this.generation) return;
          const quota = /credits.*depleted|insufficient.*quota|quota.*exceed|resource.exhausted/i.test(event.reason ?? '');
          const expired = /expired|token.*invalid|unauthenticated/i.test(event.reason ?? '');
          this.fail(quota ? 'Gemini API credits are unavailable. Check your project billing, then reconnect. Text coaching still works.' : expired ? 'Voice authorization expired. Reconnect for a fresh session; your workout is saved.' : 'Voice disconnected. Reconnect to continue your current workout.');
        },
      } });
      if (generation !== this.generation) { live.close(); return; }
      this.live = live; clearTimeout(this.deadline); this.contextRevision = -1; this.sendWorkoutContext(true); this.handleConnectionState('listening');
      this.expiry = setTimeout(() => { this.disconnect(); byId('voice-note').textContent = 'Voice stopped after ten minutes. Connect again when you’re ready.'; }, Math.max(0, Math.min(600000, Date.parse(token.expireTime) - Date.now())));
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it to retry, or use text.' : 'Gemini voice could not connect. Check credentials, microphone access and connection; text still works.');
    }
  }
  private fail(message: string) { this.disconnect(); this.handleConnectionState('error', message); }
  disconnect() {
    this.timerGuidance = undefined; this.contextDirty = false; this.speechOnset.reset();
    ++this.generation; clearTimeout(this.deadline); clearTimeout(this.expiry); this.abort?.abort();
    for (const timer of this.pendingTools.values()) clearTimeout(timer); this.pendingTools.clear();
    this.live?.close(); this.live = undefined; this.stopMicrophone(); this.audio?.close(); this.audio = undefined;
    this.toolUsed = true; this.turnEpoch++; this.playing = false; this.speakingInput = false; this.muted = false;
    this.responseOpen = false; this.discardResponse = false; this.serverActivity = false; this.localAction = undefined; this.turnRevision = -1;
    byId('voice-mute').textContent = 'Mute microphone'; byId('voice-mute').setAttribute('aria-pressed', 'false'); byId('voice-play').hidden = true;
    this.handleConnectionState(this.config?.voice.enabled ? 'disconnected' : 'disabled');
  }
}
