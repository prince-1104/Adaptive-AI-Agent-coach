import { randomBytes } from 'node:crypto';
import { REALTIME_MODEL, voiceInstructions, workoutVoiceTool } from '../shared/workout/voice.js';
import { PublicError } from './provider.js';

export const voiceStatus = (key: string) => ({ enabled: Boolean(key), model: REALTIME_MODEL,
  message: key ? 'Optional voice coach. Connect only after agreeing to microphone and API usage.' : 'Voice is off. Set ALLOW_REALTIME_VOICE=true and your key in local .env, then restart. Your microphone stays off; text still works.' });

/** Fixed endpoints and server-owned call handles; never follow a model-supplied URL. */
export class VoiceCalls {
  private calls = new Map<string, { id: string; expiry: NodeJS.Timeout }>();
  private pending = 0;
  constructor(private key: string, private transport: typeof fetch) {}
  private async hangup(id: string) {
    const response = await this.transport(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(id)}/hangup`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.key}` }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok && response.status !== 404) throw new Error('Hangup failed.');
  }
  async start(input: unknown, signal: AbortSignal) {
    if (!this.key) throw new PublicError('VOICE_DISABLED', voiceStatus('').message, 403);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PublicError('INPUT', 'Invalid voice request.', 400);
    const data = input as Record<string, unknown>;
    if (Object.keys(data).length !== 2 || data.consent !== true || typeof data.sdp !== 'string' || !data.sdp.startsWith('v=0') || data.sdp.length > 30000) throw new PublicError('INPUT', 'Voice requires explicit usage consent and a browser SDP offer.', 400);
    if (this.pending + this.calls.size >= 3) throw new PublicError('BUSY', 'Stop another voice connection first.', 429);
    this.pending++;
    try {
      const body = new FormData(); body.set('sdp', data.sdp);
      body.set('session', JSON.stringify({ type: 'realtime', model: REALTIME_MODEL, instructions: voiceInstructions,
        output_modalities: ['audio'], tools: [workoutVoiceTool], tool_choice: 'auto',
        audio: { input: { noise_reduction: { type: 'near_field' }, transcription: { model: 'gpt-live-transcribe' },
          turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true, prefix_padding_ms: 300, silence_duration_ms: 500 } }, output: { voice: 'marin' } } }));
      const response = await this.transport('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', headers: { Authorization: `Bearer ${this.key}` }, body, signal,
      });
      if (!response.ok) throw new PublicError('VOICE_CONNECT', response.status === 401 ? 'Voice credentials were rejected. Check local configuration.' : 'Voice could not connect. Check model access, API budget and connection, then retry.', 502);
      const sdp = await response.text();
      const location = response.headers.get('location') ?? '';
      const match = /^(?:https:\/\/api\.openai\.com)?\/v1\/realtime\/calls\/([a-zA-Z0-9_-]{1,200})$/.exec(location);
      if (!match || !sdp.startsWith('v=0') || sdp.length > 30000) {
        if (match) await this.hangup(match[1]).catch(() => {});
        throw new PublicError('VOICE_CONNECT', 'Voice returned an invalid session response.', 502);
      }
      if (signal.aborted) { await this.hangup(match[1]).catch(() => {}); throw new PublicError('VOICE_CANCEL', 'Voice connection cancelled.', 408); }
      const handle = randomBytes(24).toString('hex');
      const expiry = setTimeout(() => { void this.stop(handle).catch(() => {}); }, 10 * 60_000); expiry.unref();
      this.calls.set(handle, { id: match[1], expiry });
      return { sdp, handle };
    } finally { this.pending--; }
  }
  async stop(handle: unknown) {
    if (typeof handle !== 'string' || !/^[a-f0-9]{48}$/.test(handle)) throw new PublicError('INPUT', 'Invalid voice handle.', 400);
    const call = this.calls.get(handle); if (!call) return;
    await this.hangup(call.id); clearTimeout(call.expiry); this.calls.delete(handle);
  }
  dispose() { for (const handle of this.calls.keys()) void this.stop(handle).catch(() => {}); }
}
