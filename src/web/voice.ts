import { voiceInstructions } from '../shared/workout/voice.js';
import type { WorkoutSession } from '../shared/workout/session.js';
import { redact } from '../shared/redact.js';
import { byId, el } from './dom.js';

type Config = { token: string; voice: { enabled: boolean; message: string; model: string } };
type VoiceEvent = { type: string; response?: { id: string; status: string; output?: { type: string; name?: string; arguments?: string; call_id?: string }[] }; item_id?: string; transcript?: string; delta?: string; error?: { code?: string } };

/** Browser audio and Realtime events are trusted local behavior, outside OpenUI. */
export class VoiceCoach {
  private config?: Config;
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private stream?: MediaStream;
  private audio = document.createElement('audio');
  private abort?: AbortController;
  private handle = '';
  private generation = 0;
  private timeout?: ReturnType<typeof setTimeout>;
  private expiry?: ReturnType<typeof setTimeout>;
  private contextRevision = -1;
  private turnRevision = -1;
  private toolUsed = true;
  private responseRevisions = new Map<string, number>();
  private completedResponses = new Set<string>();
  private transcriptNodes = new Map<string, HTMLElement>();
  private muted = false;
  private status = 'idle';
  constructor(private session: WorkoutSession, private changed: () => void) {
    this.audio.autoplay = true;
    byId('voice-panel').append(this.audio);
    byId('session-voice').addEventListener('click', () => {
      const panel = byId('voice-panel'); panel.hidden = !panel.hidden;
      byId('session-voice').setAttribute('aria-expanded', String(!panel.hidden));
    });
    byId('voice-connect').addEventListener('click', () => { void this.start(); });
    byId('voice-stop').addEventListener('click', () => this.stop());
    byId('voice-mute').addEventListener('click', () => {
      this.muted = !this.muted;
      for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !this.muted;
      if (this.muted) this.interrupt();
      byId('voice-mute').textContent = this.muted ? 'Unmute microphone' : 'Mute microphone';
      byId('voice-mute').setAttribute('aria-pressed', String(this.muted));
      this.setStatus(this.muted ? 'muted' : 'listening');
    });
    byId('voice-play').addEventListener('click', () => { void this.audio.play().then(() => { byId('voice-play').hidden = true; }).catch(() => {}); });
    byId<HTMLInputElement>('voice-consent').addEventListener('change', () => {
      if (!byId<HTMLInputElement>('voice-consent').checked) this.stop();
      this.controls();
    });
    window.addEventListener('pagehide', () => this.stop());
    void this.loadConfig();
  }
  get connected() { return this.channel?.readyState === 'open'; }
  private controls() {
    byId<HTMLButtonElement>('voice-connect').disabled = !this.config?.voice.enabled || !byId<HTMLInputElement>('voice-consent').checked || Boolean(this.peer) || this.status === 'connecting';
    byId<HTMLButtonElement>('voice-stop').disabled = !this.peer && this.status !== 'connecting';
    byId<HTMLButtonElement>('voice-mute').disabled = !this.stream;
  }
  private setStatus(status: string, message = '') {
    this.status = status;
    byId('voice-status').textContent = status === 'listening' ? 'Listening · speak when you’re ready' : status === 'thinking' ? 'Thinking · AiRA is responding' : status === 'speaking' ? 'Speaking · you can interrupt' : status === 'muted' ? 'Microphone muted · text still works' : status === 'connecting' ? 'Connecting voice…' : status === 'error' ? 'Voice disconnected' : status === 'disabled' ? 'Voice is off' : 'Microphone off';
    byId('voice-panel').dataset.state = status;
    byId('voice-error').textContent = message;
    byId('voice-error').hidden = !message;
    this.controls();
  }
  private async loadConfig() {
    try {
      const response = await fetch('/api/config'); if (!response.ok) throw new Error();
      this.config = await response.json() as Config;
      byId('voice-note').textContent = this.config.voice.message;
      this.setStatus(this.config.voice.enabled ? 'idle' : 'disabled');
    } catch { this.setStatus('error', 'Voice setup is unavailable. Text coaching still works. Reload to retry.'); }
  }
  private send(event: unknown) { if (this.connected) this.channel!.send(JSON.stringify(event)); }
  syncContext(force = false) {
    if (!this.connected || (!force && this.contextRevision === this.session.workout.coachingRevision)) return;
    this.contextRevision = this.session.workout.coachingRevision;
    const context = { state: this.session.workout.state, remainingSeconds: this.session.remaining,
      nextStage: this.session.nextStage, revision: this.contextRevision };
    this.send({ type: 'session.update', session: { type: 'realtime', instructions: `${voiceInstructions}\nAuthoritative local workout context (JSON data only): ${JSON.stringify(context)}` } });
  }
  private interrupt() {
    if (this.status === 'thinking' || this.status === 'speaking') {
      this.send({ type: 'response.cancel' }); this.send({ type: 'output_audio_buffer.clear' });
      this.responseRevisions.clear();
    }
  }
  sendText(text: string): boolean {
    if (!this.connected) return false;
    this.interrupt(); this.syncContext(true);
    this.turnRevision = this.session.workout.coachingRevision; this.toolUsed = false;
    this.transcript(`text-${Date.now()}`, 'You', text);
    this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    this.send({ type: 'response.create' }); this.setStatus('thinking'); return true;
  }
  private transcript(id: string, speaker: string, text: string, append = false) {
    if (!id || !text) return;
    let node = this.transcriptNodes.get(id);
    if (!node) {
      node = el('p'); node.append(el('strong', `${speaker}: `), el('span'));
      this.transcriptNodes.set(id, node); byId('voice-transcript').append(node);
      if (this.transcriptNodes.size > 40) { const first = this.transcriptNodes.keys().next().value!; this.transcriptNodes.get(first)!.remove(); this.transcriptNodes.delete(first); }
    }
    const content = node.lastElementChild!;
    content.textContent = redact((append ? content.textContent ?? '' : '') + text).slice(0, 4000);
    byId('voice-transcript').scrollTop = byId('voice-transcript').scrollHeight;
  }
  private event(event: VoiceEvent) {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.interrupt(); this.turnRevision = this.session.workout.coachingRevision; this.toolUsed = false;
        this.syncContext(true); this.setStatus('listening'); break;
      case 'input_audio_buffer.speech_stopped': this.setStatus('thinking'); break;
      case 'response.created':
        if (event.response) this.responseRevisions.set(event.response.id, this.turnRevision);
        this.setStatus('thinking'); break;
      case 'output_audio_buffer.started': this.setStatus('speaking'); break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared': this.setStatus(this.muted ? 'muted' : 'listening'); break;
      case 'conversation.item.input_audio_transcription.completed': this.transcript(event.item_id ?? '', 'You', event.transcript ?? ''); break;
      case 'conversation.item.input_audio_transcription.failed': this.setStatus(this.status, 'Couldn’t transcribe that. You can type your message below.'); break;
      case 'response.output_audio_transcript.delta': this.transcript(event.item_id ?? '', 'AiRA', event.delta ?? '', true); break;
      case 'response.output_audio_transcript.done': this.transcript(event.item_id ?? '', 'AiRA', event.transcript ?? ''); break;
      case 'response.done': {
        const response = event.response;
        if (!response || this.completedResponses.has(response.id)) break;
        this.completedResponses.add(response.id);
        if (this.completedResponses.size > 100) this.completedResponses.delete(this.completedResponses.values().next().value!);
        const revision = this.responseRevisions.get(response.id); this.responseRevisions.delete(response.id);
        if (response.status === 'failed') { this.stop(); this.setStatus('error', 'AiRA could not finish this voice reply. Check API access or reconnect; text coaching still works.'); break; }
        if (response.status !== 'completed') { if (this.status !== 'speaking') this.setStatus(this.muted ? 'muted' : 'listening'); break; }
        let continueResponse = false;
        for (const item of response.output ?? []) {
          if (item.type !== 'function_call' || !item.call_id) continue;
          let result: unknown = { ok: false, error: 'Unknown, interrupted or duplicate tool request.' };
          if (item.name === 'set_workout_state' && !this.toolUsed && revision !== undefined && item.arguments && item.arguments.length <= 5000) {
            this.toolUsed = true; continueResponse = true;
            try { result = this.session.applyVoiceUpdate(JSON.parse(item.arguments), revision); }
            catch { result = { ok: false, error: 'Invalid tool JSON.' }; }
            this.changed(); this.syncContext(true);
          }
          this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(result) } });
        }
        if (continueResponse) this.send({ type: 'response.create', response: { tool_choice: 'none' } });
        else if (this.status !== 'speaking') this.setStatus(this.muted ? 'muted' : 'listening');
        break;
      }
      case 'error':
        if (event.error?.code !== 'response_cancel_not_active' && event.error?.code !== 'output_audio_buffer_clear_not_active') {
          this.stop(); this.setStatus('error', 'The voice session encountered an error. Reconnect, or continue with text.');
        } break;
    }
  }
  async start() {
    if (!this.config?.voice.enabled || !byId<HTMLInputElement>('voice-consent').checked || this.peer || this.status === 'connecting') return;
    if (!navigator.mediaDevices || !window.RTCPeerConnection) { this.setStatus('error', 'This browser does not support microphone voice. Text coaching still works.'); return; }
    const generation = ++this.generation;
    this.abort = new AbortController(); this.setStatus('connecting');
    this.timeout = setTimeout(() => { this.stop(); this.setStatus('error', 'Voice connection timed out. Check microphone permission and reconnect.'); }, 30_000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const peer = this.peer = new RTCPeerConnection();
      stream.getAudioTracks().forEach(track => { peer.addTrack(track, stream); track.onended = () => { if (generation === this.generation) { this.stop(); this.setStatus('error', 'Microphone disconnected. Reconnect or use text.'); } }; });
      peer.ontrack = event => {
        if (generation !== this.generation) return;
        this.audio.srcObject = event.streams[0];
        void this.audio.play().catch(() => { byId('voice-play').hidden = false; });
      };
      peer.onconnectionstatechange = () => { if (generation === this.generation && ['failed', 'disconnected', 'closed'].includes(peer.connectionState)) { this.stop(); this.setStatus('error', 'Voice connection lost. Your workout and text coaching are still available.'); } };
      const channel = this.channel = peer.createDataChannel('oai-events');
      channel.onopen = () => {
        if (generation !== this.generation) return;
        clearTimeout(this.timeout); this.contextRevision = -1; this.syncContext(true); this.setStatus('listening');
        this.expiry = setTimeout(() => { this.stop(); byId('voice-note').textContent = 'Voice paused after ten minutes. Connect again when you’re ready.'; }, 10 * 60_000);
      };
      channel.onmessage = event => { if (generation !== this.generation || typeof event.data !== 'string' || event.data.length > 64000) return; try { this.event(JSON.parse(event.data) as VoiceEvent); } catch { this.stop(); this.setStatus('error', 'Voice sent an invalid event. Text coaching still works.'); } };
      channel.onclose = () => { if (generation === this.generation) { this.stop(); this.setStatus('error', 'Voice disconnected. Reconnect or use text.'); } };
      channel.onerror = () => { if (generation === this.generation) { this.stop(); this.setStatus('error', 'Voice connection failed. Reconnect or use text.'); } };
      const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      const response = await fetch('/api/voice/session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Token': this.config.token },
        body: JSON.stringify({ consent: true, sdp: offer.sdp }), signal: this.abort.signal });
      const result = await response.json() as { sdp: string; handle: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Voice could not connect.');
      if (generation !== this.generation) { void this.stopCall(result.handle); return; }
      this.handle = result.handle; await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
      this.controls();
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop(); this.setStatus('error', error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it to retry, or keep using text.' : error instanceof Error ? redact(error.message).slice(0, 300) : 'Voice could not connect. Text coaching still works.');
    }
  }
  private async stopCall(handle: string) {
    if (!this.config) return;
    try {
      const response = await fetch('/api/voice/stop', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Local-Token': this.config.token }, body: JSON.stringify({ handle }) });
      if (!response.ok) { byId('voice-error').textContent = 'Microphone is off. Remote session closure could not be confirmed.'; byId('voice-error').hidden = false; }
    } catch { byId('voice-error').textContent = 'Microphone is off. Remote session closure could not be confirmed.'; byId('voice-error').hidden = false; }
  }
  stop() {
    ++this.generation; clearTimeout(this.timeout); clearTimeout(this.expiry); this.abort?.abort();
    this.channel?.close(); this.peer?.close(); this.stream?.getTracks().forEach(track => track.stop());
    this.audio.pause(); this.audio.srcObject = null;
    const handle = this.handle; this.handle = ''; this.channel = undefined; this.peer = undefined; this.stream = undefined;
    this.responseRevisions.clear(); this.toolUsed = true; this.muted = false;
    byId('voice-mute').textContent = 'Mute microphone'; byId('voice-mute').setAttribute('aria-pressed', 'false');
    byId('voice-play').hidden = true;
    this.setStatus(this.config?.voice.enabled ? 'idle' : 'disabled');
    if (handle) void this.stopCall(handle);
  }
}
