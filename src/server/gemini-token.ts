import { GoogleGenAI, type CreateAuthTokenParameters, type AuthToken } from '@google/genai';
import { GEMINI_LIVE_MODEL, geminiLiveConfig, geminiVoiceStatus } from './gemini-live.js';
import { PublicError } from './provider.js';

export type TokenIssuer = (params: CreateAuthTokenParameters) => Promise<AuthToken>;
/** One-use credentials constrained to the server-authored model, instructions and tool. */
export class GeminiTokenService {
  private pending = 0;
  constructor(private key: string, private issuer?: TokenIssuer) {}
  async create(input: unknown, signal: AbortSignal) {
    if (!this.key) throw new PublicError('VOICE_DISABLED', geminiVoiceStatus('').message, 403);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || (input as { consent?: unknown }).consent !== true) throw new PublicError('INPUT', 'Explicit voice usage consent is required.', 400);
    if (this.pending >= 3) throw new PublicError('BUSY', 'Too many pending voice connections. Try again.', 429);
    this.pending++;
    try {
      const expireTime = new Date(Date.now() + 10 * 60_000).toISOString();
      const params: CreateAuthTokenParameters = { config: { uses: 1, expireTime,
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(), abortSignal: signal,
        liveConnectConstraints: { model: GEMINI_LIVE_MODEL, config: geminiLiveConfig() },
      } };
      const issuer = this.issuer ?? ((request: CreateAuthTokenParameters) => new GoogleGenAI({ apiKey: this.key, httpOptions: { apiVersion: 'v1beta' } }).authTokens.create(request));
      const token = await issuer(params);
      if (signal.aborted) throw new Error('Cancelled');
      if (!token.name || !token.name.startsWith('auth_tokens/') || token.name.length > 8000) throw new Error('Invalid token');
      return { token: token.name, model: GEMINI_LIVE_MODEL, expireTime };
    } catch {
      throw new PublicError('GEMINI_SESSION', 'Gemini voice could not connect. Check local credentials, model access, API budget and connection. Text coaching still works.', signal.aborted ? 408 : 502);
    } finally { this.pending--; }
  }
}
