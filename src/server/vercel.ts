import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TokenIssuer } from './gemini-token.js';
import { createRequestHandler, readConfig } from './app.js';

const cookieName = '__Host-aira-csrf';
export function hostedOrigins(env: NodeJS.ProcessEnv): string[] {
  const candidates = [env.APP_ORIGIN, ...[env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host => `https://${host}`)].filter(Boolean) as string[];
  const origins = candidates.map(value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_ORIGIN must be an exact HTTPS origin.');
    return url.origin;
  });
  if (!origins.length) throw new Error('Hosted deployment needs APP_ORIGIN or Vercel deployment URL configuration.');
  return [...new Set(origins)];
}
function cookie(req: IncomingMessage): string {
  const values = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
  if (values.length !== 1) return '';
  const value = values[0].slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}
export function createHostedHandler(env: NodeJS.ProcessEnv, root: string, transport: typeof fetch = fetch, tokenIssuer?: TokenIssuer) {
  const origins = hostedOrigins(env);
  // Local CLI executables cannot be provisioned inside a hosted function.
  // Account-backed APIs need an explicit hosted opt-in as well as per-request consent.
  const enabled = env.ALLOW_HOSTED_MODEL_API === 'true';
  const config = readConfig({ ...env, APP_MODE: 'mock', ALLOW_CLAUDE_CLI: 'false',
    ALLOW_LIVE_API: enabled ? env.ALLOW_LIVE_API : 'false', GEMINI_API_KEY: enabled ? env.GEMINI_API_KEY : '' }, root);
  return createRequestHandler(config, transport, undefined, undefined, tokenIssuer, {
    allowed: req => {
      const host = req.headers.host;
      if (!host || !origins.some(origin => new URL(origin).host === host) || req.headers['sec-fetch-site'] === 'cross-site') return false;
      if (req.method === 'POST') return Boolean(req.headers.origin && origins.includes(req.headers.origin));
      return !req.headers.origin || origins.includes(req.headers.origin);
    },
    token: (req: IncomingMessage, res: ServerResponse, issue: boolean) => {
      const existing = cookie(req);
      if (existing || !issue) return existing;
      const token = randomBytes(32).toString('hex');
      // Double-submit CSRF: shared by functions via a host-only cookie, not process memory.
      // This is request protection, not authentication. Protect paid demos at Vercel's edge.
      res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict`);
      return token;
    },
  });
}
let handler: ReturnType<typeof createHostedHandler> | undefined;
export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  try {
    handler ??= createHostedHandler(process.env, process.cwd());
    await handler(req, res);
  } catch {
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'Hosted configuration is invalid. Check the deployment environment.' })); }
  }
}
