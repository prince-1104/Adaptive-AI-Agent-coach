import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { APP_VERSION, SCHEMA_VERSION, isRequest, isTurn, type Versions, type Result } from '../shared/contracts.js';
import { mockTurn } from './mock.js';
import { loadPrompt } from './prompt.js';
import { ScreenDocument } from '../shared/openui/document.js';
import { liveTurn, PublicError } from './provider.js';
import { providerStatuses, type Config } from './config.js';
import { claudeTurn, codexTurn } from './cli.js';
import { type ProcessTransport } from './subprocess.js';
import { redactValue } from '../shared/redact.js';
import { GeminiTokenService, type TokenIssuer } from './gemini-token.js';
import { geminiVoiceStatus } from './gemini-live.js';
export { readConfig } from './config.js';
export const securityHeaders = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' wss://generativelanguage.googleapis.com; media-src 'self' blob:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json' }); res.end(JSON.stringify(value));
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  let parsed: unknown;
  try { parsed = (req as IncomingMessage & { body?: unknown }).body; }
  catch { throw new PublicError('INPUT', 'Send valid JSON.', 400); }
  if (parsed !== undefined) {
    if (Buffer.byteLength(JSON.stringify(parsed), 'utf8') > 160_000) throw new PublicError('INPUT', 'This run is too large. Export it and reset.', 413);
    return parsed;
  }
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 160_000) throw new PublicError('INPUT', 'This run is too large. Export it and reset.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PublicError('INPUT', 'Send valid JSON.', 400); }
}
export type RequestAccess = {
  allowed: (req: IncomingMessage) => boolean;
  token: (req: IncomingMessage, res: ServerResponse, issue: boolean) => string;
};
export function createRequestHandler(config: Config, transport: typeof fetch = fetch, cliTransport?: ProcessTransport, cliResolver?: (path: string) => Promise<string>, tokenIssuer?: TokenIssuer, access?: RequestAccess) {
  const token = randomBytes(32).toString('hex');
  const voice = new GeminiTokenService(config.geminiKey, tokenIssuer);
  let active = 0;
  const verifyToken = (req: IncomingMessage, res: ServerResponse) => {
    const expected = access?.token(req, res, false) ?? token;
    const supplied = Buffer.from(String(req.headers['x-local-token'] ?? ''));
    if (!expected || supplied.length !== expected.length || !timingSafeEqual(supplied, Buffer.from(expected))) throw new PublicError('FORBIDDEN', 'Reload the app before making requests.', 403);
  };
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (access && !access.allowed(req)) { json(res, 403, { error: 'Only this app may make requests.' }); return; }
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path === '/api/config' && req.method === 'GET') {
        json(res, 200, { defaultProvider: 'mock', providers: providerStatuses(config), voice: geminiVoiceStatus(config.geminiKey), token: access?.token(req, res, true) ?? token, appVersion: APP_VERSION }); return;
      }
      if (path === '/api/voice/token' && req.method === 'POST') {
        verifyToken(req, res);
        if (req.headers['content-type'] !== 'application/json') throw new PublicError('INPUT', 'Expected application/json.', 415);
        const input = await readBody(req);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        res.once('close', () => { if (!res.writableEnded) controller.abort(); });
        try { const result = await voice.create(input, controller.signal); if (!res.destroyed) json(res, 200, result); }
        finally { clearTimeout(timeout); }
        return;
      }
      if (path === '/api/turn' && req.method === 'POST') {
        verifyToken(req, res);
        if (req.headers['content-type'] !== 'application/json') throw new PublicError('INPUT', 'Expected application/json.', 415);
        const input = await readBody(req);
        if (!isRequest(input)) throw new PublicError('INPUT', 'The conversation request is invalid. Reset and try again.', 400);
        if (input.provider === 'codex-cli') await codexTurn();
        const provider = providerStatuses(config).find(item => item.id === input.provider)!;
        if (!provider.enabled || (input.provider !== 'mock' && !input.consent)) throw new PublicError('OPT_IN', 'This provider needs local setup and explicit usage consent before sending. Check the provider selector and README.', 403);
        if (active >= 3) throw new PublicError('BUSY', 'Too many pending requests. Cancel and try again.', 429);
        active++;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), input.provider === 'claude-cli' ? 80_000 : 45_000);
        res.once('close', () => { if (!res.writableEnded) controller.abort(); });
        try {
          const prompt = await loadPrompt(config.root);
          const skill = prompt.instructions;
          const versions: Versions = { app: APP_VERSION, schema: SCHEMA_VERSION, skillHash: prompt.skillHash, protocolHash: prompt.protocolHash, mode: input.provider === 'mock' ? 'mock' : 'live', provider: input.provider, model: provider.model, returnedModel: null, runtimeVersion: null, restrictionProfile: null };
          let turn;
          if (input.provider === 'mock') {
            await delay(input.fault === 'slow' ? 2400 : 350, undefined, { signal: controller.signal });
            if (input.fault === 'request') throw new PublicError('MOCK_REQUEST', 'Simulated model request failure. Retry this turn.');
            if (input.fault === 'schema') throw new PublicError('SCHEMA', 'Simulated invalid component schema. Retry this turn.');
            turn = mockTurn(input, await readFile(join(config.root, 'examples/wiring.openui'), 'utf8'));
          } else if (input.provider === 'claude-cli') {
            const result = await claudeTurn(input, skill, config.claude, controller.signal, cliTransport, cliResolver);
            turn = result.turn; versions.returnedModel = result.returnedModel; versions.runtimeVersion = result.runtimeVersion; versions.restrictionProfile = result.restrictionProfile;
          } else {
            if (!config.allowLive || !config.key) throw new PublicError('CONFIG', 'Live access is not enabled.', 403);
            const result = await liveTurn(input, skill, { key: config.key, model: config.model }, controller.signal, transport);
            turn = result.turn; versions.returnedModel = result.returnedModel;
          }
          if (!isTurn(turn)) throw new PublicError('SCHEMA', 'The response did not match the component schema. Retry this turn.');
          const safe = redactValue({ turn, versions }) as Result;
          const preview = new ScreenDocument();
          try { if (input.state.ui_state) preview.apply('```openui\n' + input.state.ui_state + '\n```'); preview.apply(safe.turn.reply); }
          catch { throw new PublicError('SCHEMA', 'The response has an invalid OpenUI screen. The previous screen is kept. Retry or check your component/skill.'); }
          if (!controller.signal.aborted) json(res, 200, safe);
          else if (!res.destroyed) json(res, 408, { error: 'The request timed out. Retry this turn.' });
        } finally { clearTimeout(timeout); active--; }
        return;
      }
      if (req.method !== 'GET') { json(res, 405, { error: 'Method not allowed.' }); return; }
      // Explicit static roots only. No server source, .env, skill or filesystem routes.
      const file = path === '/' ? 'web/index.html' : decodeURIComponent(path.slice(1));
      if (!/^(web|shared)\/[a-zA-Z0-9/_-]+\.(js|css|html)$/.test(file) && !['web/assets/aira-trainer.glb', 'web/assets/aira-sticker.png'].includes(file)) { json(res, 404, { error: 'Not found.' }); return; }
      const root = await realpath(join(config.root, 'dist'));
      const target = await realpath(resolve(root, file));
      if (!['web', 'shared'].some(directory => target.startsWith(join(root, directory) + sep))) { json(res, 404, { error: 'Not found.' }); return; }
      const data = await readFile(target);
      const mime: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };
      const contentType = mime[extname(target)];
      res.writeHead(200, { ...securityHeaders, 'Content-Type': contentType + (contentType.startsWith('text/') ? '; charset=utf-8' : '') }); res.end(data);
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (error instanceof PublicError) json(res, error.status, { error: error.message, code: error.code });
      else if (error instanceof Error && 'code' in error && error.code === 'ENOENT') json(res, 404, { error: 'Required local file was not found. Rebuild and check the skill file.' });
      else json(res, 500, { error: 'The local request failed. Check your skill file or restart the server.' });
    }
  };
}
export function createApp(config: Config, transport: typeof fetch = fetch, cliTransport?: ProcessTransport, cliResolver?: (path: string) => Promise<string>, tokenIssuer?: TokenIssuer) {
  const token = randomBytes(32).toString('hex');
  const handler = createRequestHandler(config, transport, cliTransport, cliResolver, tokenIssuer, {
    allowed: req => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 4319;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      return hosts.includes(req.headers.host ?? '') && (!req.headers.origin || hosts.some(host => req.headers.origin === `http://${host}`)) && req.headers['sec-fetch-site'] !== 'cross-site';
    },
    token: () => token,
  });
  const server = createServer(handler);
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return server;
}
