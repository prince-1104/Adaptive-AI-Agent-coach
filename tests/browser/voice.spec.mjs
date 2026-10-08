import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function setup(page, mode = 'normal') {
  await page.route('**/api/config', async route => {
    const response = await route.fetch(); const config = await response.json();
    config.voice = { enabled: true, model: 'gpt-realtime-2.1-mini', message: 'Synthetic voice transport. No API requests.' };
    await route.fulfill({ json: config });
  });
  await page.route('**/api/voice/session', route => route.fulfill({ json: { sdp: 'v=0\r\nsynthetic-answer', handle: 'a'.repeat(48) } }));
  await page.route('**/api/voice/stop', route => route.fulfill({ json: { stopped: true } }));
  await page.addInitScript(mode => {
    const harness = window.voiceHarness = { sent: [], permissions: 0, tracksStopped: 0, closed: 0 };
    const track = { enabled: true, onended: null, stop: () => { harness.tracksStopped++; } };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      harness.permissions++;
      if (mode === 'denied') throw new DOMException('Synthetic denied', 'NotAllowedError');
      if (mode === 'pending') return new Promise(resolve => { harness.resolveMicrophone = () => resolve(stream); });
      return stream;
    } });
    window.RTCPeerConnection = class {
      constructor() { harness.peer = this; }
      connectionState = 'new';
      addTrack() {}
      createDataChannel() {
        const channel = { readyState: 'connecting', send: data => harness.sent.push(JSON.parse(data)), close: () => { channel.readyState = 'closed'; channel.onclose?.(); } };
        harness.channel = channel; harness.emit = event => channel.onmessage?.({ data: JSON.stringify(event) }); return channel;
      }
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\nsynthetic-offer' }; }
      async setLocalDescription() {}
      async setRemoteDescription() { harness.channel.readyState = 'open'; harness.channel.onopen?.(); }
      close() { harness.closed++; this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
    };
  }, mode);
  await page.goto('/'); await page.locator('#session-voice').click();
  await expect(page.locator('#voice-note')).toContainText('Synthetic');
}
async function connect(page) {
  await page.locator('#voice-consent').check(); await page.locator('#voice-connect').click();
  await expect(page.locator('#voice-status')).toContainText('Listening');
}
const emit = (page, event) => page.evaluate(event => window.voiceHarness.emit(event), event);
async function tool(page, patch, id = 'r1', name = 'set_workout_state') {
  await emit(page, { type: 'input_audio_buffer.speech_started' });
  await emit(page, { type: 'response.created', response: { id } });
  await emit(page, { type: 'response.done', response: { id, status: 'completed', output: [{ type: 'function_call', name, call_id: `call-${id}`, arguments: JSON.stringify(patch) }] } });
}

test('voice consent gates microphone; tools update the same workout, timer and trainer', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await setup(page); await expect(page.locator('#voice-connect')).toBeDisabled();
  expect(await page.evaluate(() => window.voiceHarness.permissions)).toBe(0);
  for (let i = 0; i < 3; i++) await page.locator('#session-next').click();
  await connect(page); await tool(page, { difficulty: 'easy' });
  await expect(page.locator('#session-difficulty')).toHaveText('Gentle pace');
  await tool(page, { phase: 'recovery', coachCue: 'A moment to recover.' }, 'r2');
  await expect(page.locator('#session-phase')).toHaveText('recovery');
  await expect(page.locator('#session-timer')).toHaveText('00:11');
  await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-animation', 'recover');
  await expect(page.locator('#session-coach')).toContainText('A moment to recover');
  await tool(page, { phase: 'complete' }, 'invalid'); await expect(page.locator('#session-phase')).toHaveText('recovery');
  const result = await page.evaluate(() => JSON.parse(window.voiceHarness.sent.filter(e => e.item?.call_id === 'call-invalid').at(-1).item.output)); expect(result.ok).toBe(false);
  await page.locator('#voice-stop').click(); await expect(page.locator('#voice-status')).toHaveText('Microphone off');
  expect(await page.evaluate(() => window.voiceHarness.tracksStopped)).toBe(1);
  await page.locator('#coach-input').fill('next'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#session-phase')).toHaveText('adaptation'); expect(errors).toEqual([]);
});

test('blocked audio autoplay exposes a retry control and voice transcripts stay out of exports', async ({ page }) => {
  await setup(page); await connect(page);
  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Synthetic blocked autoplay', 'NotAllowedError'));
    window.voiceHarness.peer.ontrack({ streams: [new MediaStream()] });
  });
  await expect(page.locator('#voice-play')).toBeVisible();
  await page.evaluate(() => { HTMLMediaElement.prototype.play = () => Promise.resolve(); });
  await page.locator('#voice-play').click(); await expect(page.locator('#voice-play')).toBeHidden();
  await emit(page, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'private', transcript: 'SYNTHETIC_PRIVATE_VOICE_TRANSCRIPT' });
  await expect(page.locator('#voice-transcript')).toContainText('SYNTHETIC_PRIVATE_VOICE_TRANSCRIPT');
  await page.locator('.builder').evaluate(element => element.open = true); await page.locator('#sample').click();
  await expect(page.locator('#export')).toBeEnabled();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click();
  const download = await downloadPromise; const payload = await readFile(await download.path(), 'utf8');
  expect(payload).not.toContain('SYNTHETIC_PRIVATE_VOICE_TRANSCRIPT'); expect(payload).not.toContain('a'.repeat(48));
});

test('barge-in cancels output; transcripts and typed fallback remain available', async ({ page }) => {
  await setup(page); await connect(page);
  await emit(page, { type: 'response.created', response: { id: 'speaking' } });
  await emit(page, { type: 'output_audio_buffer.started' }); await expect(page.locator('#voice-status')).toContainText('Speaking');
  await emit(page, { type: 'response.output_audio_transcript.delta', item_id: 'answer', delta: 'What comes ' });
  await emit(page, { type: 'response.output_audio_transcript.delta', item_id: 'answer', delta: 'next?' });
  await expect(page.locator('#voice-transcript')).toContainText('AiRA: What comes next?');
  await emit(page, { type: 'input_audio_buffer.speech_started' }); await expect(page.locator('#voice-status')).toContainText('Listening');
  expect(await page.evaluate(() => window.voiceHarness.sent.some(e => e.type === 'output_audio_buffer.clear'))).toBe(true);
  await emit(page, { type: 'input_audio_buffer.speech_stopped' }); await expect(page.locator('#voice-status')).toContainText('Thinking');
  await emit(page, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'user', transcript: 'Repeat that.' });
  await expect(page.locator('#voice-transcript')).toContainText('You: Repeat that.');
  await page.locator('#coach-input').fill('What comes next?'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#voice-transcript')).toContainText('You: What comes next?');
  expect(await page.evaluate(() => window.voiceHarness.sent.some(e => e.item?.content?.[0]?.text === 'What comes next?'))).toBe(true);
  await page.locator('#voice-mute').click(); await expect(page.locator('#voice-status')).toContainText('muted');
  await expect(page.locator('#voice-mute')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#voice-consent').uncheck(); await expect(page.locator('#voice-status')).toHaveText('Microphone off');
});

test('stale, interrupted, repeated and unknown tool requests cannot mutate the session', async ({ page }) => {
  await setup(page); for (let i = 0; i < 3; i++) await page.locator('#session-next').click(); await connect(page);
  await emit(page, { type: 'input_audio_buffer.speech_started' }); await emit(page, { type: 'response.created', response: { id: 'late' } });
  await page.locator('#session-next').click();
  await emit(page, { type: 'response.done', response: { id: 'late', status: 'completed', output: [{ type: 'function_call', name: 'set_workout_state', call_id: 'late-tool', arguments: '{"phase":"adaptation"}' }] } });
  await expect(page.locator('#session-phase')).toHaveText('recovery');
  expect(await page.evaluate(() => JSON.parse(window.voiceHarness.sent.find(e => e.item?.call_id === 'late-tool').item.output).ok)).toBe(false);
  await tool(page, { phase: 'adaptation' }, 'unknown', 'run_javascript'); await expect(page.locator('#session-phase')).toHaveText('recovery');
  await emit(page, { type: 'input_audio_buffer.speech_started' }); await emit(page, { type: 'response.created', response: { id: 'cancelled' } });
  await emit(page, { type: 'output_audio_buffer.started' }); await emit(page, { type: 'input_audio_buffer.speech_started' });
  await emit(page, { type: 'response.done', response: { id: 'cancelled', status: 'completed', output: [{ type: 'function_call', name: 'set_workout_state', call_id: 'cancelled-tool', arguments: '{"phase":"adaptation"}' }] } });
  await expect(page.locator('#session-phase')).toHaveText('recovery');
  await tool(page, { phase: 'adaptation' }, 'valid'); await expect(page.locator('#session-phase')).toHaveText('adaptation');
  await emit(page, { type: 'response.done', response: { id: 'valid', status: 'completed', output: [{ type: 'function_call', name: 'set_workout_state', call_id: 'call-valid', arguments: '{"phase":"active"}' }] } });
  await expect(page.locator('#session-phase')).toHaveText('adaptation');
});

test('denied microphone permission preserves text coaching', async ({ page }) => {
  await setup(page, 'denied'); await page.locator('#voice-consent').check(); await page.locator('#voice-connect').click();
  await expect(page.locator('#voice-error')).toContainText('permission was denied'); await expect(page.locator('#voice-connect')).toBeEnabled();
  await page.locator('#coach-input').fill('start'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit()); await expect(page.locator('#session-phase')).toHaveText('check-in');
});

test('connection errors release media and allow voice retry without losing the workout', async ({ page }) => {
  await setup(page); await connect(page); await page.locator('#session-next').click();
  await emit(page, { type: 'error', error: { code: 'synthetic_connection_failure' } });
  await expect(page.locator('#voice-error')).toContainText('Reconnect');
  await expect(page.locator('#voice-status')).toHaveText('Voice disconnected');
  expect(await page.evaluate(() => window.voiceHarness.tracksStopped)).toBe(1);
  await expect(page.locator('#session-phase')).toHaveText('check-in');
  await page.locator('#voice-connect').click(); await expect(page.locator('#voice-status')).toContainText('Listening');
  await emit(page, { type: 'response.created', response: { id: 'failed-response' } });
  await emit(page, { type: 'response.done', response: { id: 'failed-response', status: 'failed', output: [] } });
  await expect(page.locator('#voice-error')).toContainText('could not finish');
  expect(await page.evaluate(() => window.voiceHarness.tracksStopped)).toBe(2);
});

test('stop while permission is pending releases late microphone tracks without starting a call', async ({ page }) => {
  let requests = 0; page.on('request', request => { if (request.url().endsWith('/api/voice/session')) requests++; });
  await setup(page, 'pending'); await page.locator('#voice-consent').check(); await page.locator('#voice-connect').click();
  await expect(page.locator('#voice-status')).toContainText('Connecting'); await expect(page.locator('#voice-connect')).toBeDisabled();
  await page.locator('#voice-stop').click(); await page.evaluate(() => window.voiceHarness.resolveMicrophone());
  await expect(page.locator('#voice-status')).toHaveText('Microphone off');
  expect(await page.evaluate(() => window.voiceHarness.tracksStopped)).toBe(1); expect(requests).toBe(0);
});

test('no-credentials mode never requests the microphone and text/mock remain available', async ({ page }) => {
  let calls = 0; page.on('request', request => { if (request.url().includes('/api/voice/session')) calls++; });
  await page.goto('/'); await page.locator('#session-voice').click(); await expect(page.locator('#voice-status')).toHaveText('Voice is off');
  await page.locator('#voice-consent').check(); await expect(page.locator('#voice-connect')).toBeDisabled(); expect(calls).toBe(0);
  await page.locator('#coach-input').fill('start'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit()); await expect(page.locator('#session-phase')).toHaveText('check-in');
  await page.locator('.builder').evaluate(element => element.open = true); await page.locator('#sample').click(); await expect(page.locator('#screen')).toContainText('Sample');
});
