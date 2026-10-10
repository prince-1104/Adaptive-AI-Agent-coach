import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createHostedHandler, hostedOrigins } from '../dist/server/vercel.js';
const root = process.cwd(), origin = 'https://aira.example';
const env = { APP_ORIGIN: origin };
const input = { provider: 'mock', consent: false, fault: 'none', messages: [{ role: 'user', content: '/demo' }], state: { ui_state: '', client_events: [] } };
function hostedFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: options.method || 'GET', headers: options.headers }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
    });
    req.on('error', reject); req.end(options.body);
  });
}
async function app(t, options = env, parsed = false, issuer) {
  const handler = createHostedHandler(options, root, fetch, issuer);
  const server = createServer(async (req, res) => {
    if (parsed && req.method === 'POST') { const chunks = []; for await (const chunk of req) chunks.push(chunk); req.body = JSON.parse(Buffer.concat(chunks).toString()); }
    await handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const config = await hostedFetch(url + '/api/config', { headers: { Host: 'aira.example' } });
  return { url, config: await config.json(), cookie: config.headers.get('set-cookie').split(';')[0], header: config.headers.get('set-cookie') };
}
const post = (app, path, body, extra = {}) => hostedFetch(app.url + path, { method: 'POST', headers: { Host: 'aira.example', Origin: origin, Cookie: app.cookie, 'X-Local-Token': app.config.token, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });

test('hosted origins require exact HTTPS domains without trusting forwarded headers', () => {
  assert.deepEqual(hostedOrigins({ VERCEL_URL: 'aira-demo.vercel.app' }), ['https://aira-demo.vercel.app']);
  for (const APP_ORIGIN of ['http://aira.example', 'https://aira.example/path', 'https://user:pass@aira.example']) assert.throws(() => hostedOrigins({ APP_ORIGIN }));
  assert.throws(() => hostedOrigins({}));
});
test('cookie request token works across independent hosted function instances and parsed bodies', async t => {
  const a = await app(t), b = await app(t, env, true);
  assert.match(a.header, /Secure; HttpOnly; SameSite=Strict/);
  const response = await post({ ...b, cookie: a.cookie, config: a.config }, '/api/turn', input);
  assert.equal(response.status, 200); assert.match((await response.json()).turn.reply, /openui/);
});
test('hosted requests reject missing/mismatched cookies, foreign origins and spoofed hosts', async t => {
  const a = await app(t);
  for (const headers of [{ Cookie: '' }, { 'X-Local-Token': 'wrong' }, { Origin: '' }, { Origin: 'https://evil.example' }, { Host: 'evil.example', 'X-Forwarded-Host': 'aira.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await post(a, '/api/turn', input, headers)).status, 403);
  assert.equal((await hostedFetch(a.url + '/.env', { headers: { Host: 'aira.example' } })).status, 404);
});
test('hosted paid providers and local CLI remain disabled without explicit hosted opt-in', async t => {
  const a = await app(t, { ...env, GEMINI_API_KEY: 'synthetic', OPENAI_API_KEY: 'synthetic', ALLOW_LIVE_API: 'true', ALLOW_CLAUDE_CLI: 'true', CLI_PROFILE_ACKNOWLEDGED: 'true', CLAUDE_CLI_PATH: 'synthetic' });
  assert.equal(a.config.voice.enabled, false);
  assert.equal(a.config.providers.find(p => p.id === 'openai-api').enabled, false);
  assert.equal(a.config.providers.find(p => p.id === 'claude-cli').enabled, false);
  assert.equal((await post(a, '/api/voice/token', { consent: true })).status, 403);
});
test('hosted Gemini token issuance requires consent and keeps the long-lived key private', async t => {
  let calls = 0;
  const a = await app(t, { ...env, ALLOW_HOSTED_MODEL_API: 'true', GEMINI_API_KEY: 'synthetic-private-key' }, false, async () => { calls++; return { name: 'auth_tokens/fake' }; });
  assert.equal(a.config.voice.enabled, true); assert(!JSON.stringify(a.config).includes('synthetic-private-key'));
  assert.equal((await post(a, '/api/voice/token', { consent: false })).status, 400); assert.equal(calls, 0);
  const response = await post(a, '/api/voice/token', { consent: true }); assert.equal(response.status, 200);
  assert.equal((await response.json()).token, 'auth_tokens/fake'); assert.equal(calls, 1);
});
