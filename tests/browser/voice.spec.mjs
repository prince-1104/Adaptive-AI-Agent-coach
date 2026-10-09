import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function setup(page, mode = 'normal') {
  await page.route('**/api/config', async route => {
    const response = await route.fetch(); const config = await response.json();
    config.voice = { enabled: true, model: 'gemini-3.8-live', message: 'Synthetic Gemini transport. No model requests.' }; await route.fulfill({ json: config });
  });
  await page.route('**/api/voice/token', route => route.fulfill({ json: { token: 'auth_tokens/fake', model: 'gemini-3.8-live', expireTime: new Date(Date.now() + 600000).toISOString() } }));
  await page.addInitScript(mode => {
    const harness = window.voiceHarness = { sent: [], permissions: 0, tracksStopped: 0, closed: 0, sources: [], audioStopped: 0 };
    const track = { enabled: true, onended: null, stop: () => { harness.tracksStopped++; } };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      harness.permissions++; if (mode === 'denied') throw new DOMException('Synthetic denied', 'NotAllowedError');
      if (mode === 'pending') return new Promise(resolve => { harness.resolveMicrophone = () => resolve(stream); }); return stream;
    } });
    window.WebSocket = class {
      constructor(url) { harness.socket = this; harness.scopedEndpoint = url.includes('generativelanguage.googleapis.com') && url.includes('BidiGenerateContentConstrained'); this.readyState = 0; queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); }); }
      send(data) { const event = JSON.parse(data); harness.sent.push(event); if (event.setup) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) })); }
      close() { harness.closed++; this.readyState = 3; this.onclose?.({}); }
    };
    window.AudioContext = class {
      state = 'running'; currentTime = 0; destination = {}; sampleRate = 16000;
      audioWorklet = { addModule: async () => {} };
      resume() { return mode === 'autoplay' && !harness.allowAudio ? Promise.reject(new DOMException('Blocked', 'NotAllowedError')) : Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createAnalyser() { return { fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData(samples) { samples.fill(harness.sources.length ? 0.08 : 0); } }; }
      createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
      createBuffer(_channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
      createBufferSource() { const source = { connect() {}, disconnect() {}, start() { harness.sources.push(source); }, stop() { harness.audioStopped++; }, onended: null }; return source; }
    };
    window.AudioWorkletNode = class { constructor() { this.port = { onmessage: null, close() {} }; harness.capture = this; } connect() {} disconnect() {} };
    harness.emit = event => harness.socket.onmessage?.({ data: JSON.stringify(event) });
    harness.chunk = level => harness.capture.port.onmessage?.({ data: { samples: new Float32Array(512).fill(level), rate: 16000 } });
    harness.finishAudio = () => { for (const source of harness.sources) source.onended?.(); harness.sources = []; };
  }, mode);
  await page.goto('/'); await page.locator('#session-voice').click(); await expect(page.locator('#voice-note')).toContainText('Synthetic');
  await page.locator('.voice-transcript-details').evaluate(element => element.open = true);
}
async function connect(page) { await page.locator('#voice-consent').check(); await page.locator('#voice-connect').click(); await expect(page.locator('#voice-status')).toContainText('Listening'); }
const emit = (page, event) => page.evaluate(event => window.voiceHarness.emit(event), event);
async function speak(page) {
  await emit(page, { serverContent: { turnComplete: true } });
  await emit(page, { voiceActivity: { type: 'ACTIVITY_START' } });
  await page.evaluate(() => window.voiceHarness.chunk(0.1));
  await emit(page, { voiceActivity: { type: 'ACTIVITY_END' } });
}
async function tool(page, args, id = 'tool-1', name = 'workout_action') {
  await speak(page); await emit(page, { toolCall: { functionCalls: [{ id, name, args }] } });
  await expect.poll(() => page.evaluate(id => window.voiceHarness.sent.some(e => e.toolResponse?.functionResponses?.some(r => r.id === id)), id)).toBe(true);
}
const pcm = Buffer.alloc(2400).toString('base64');

test('barge-in stops all scheduled audio and fences stale chunks until the interrupted turn completes', async ({ page }) => {
  await setup(page); await connect(page); await speak(page);
  const audio = { serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] } } };
  await emit(page, audio); await emit(page, audio);
  await expect(page.locator('#voice-status')).toContainText('AiRA speaking');
  await expect(page.locator('.trainer-view')).toHaveAttribute('data-speaking', 'true');
  await emit(page, { voiceActivity: { type: 'ACTIVITY_START' } });
  await expect(page.locator('.trainer-view')).toHaveAttribute('data-speaking', 'false');
  expect(await page.evaluate(() => window.voiceHarness.audioStopped)).toBe(2);
  await emit(page, audio);
  await emit(page, { voiceActivity: { type: 'ACTIVITY_END' } });
  await emit(page, audio);
  expect(await page.evaluate(() => window.voiceHarness.sources.length)).toBe(2);
  await emit(page, { serverContent: { interrupted: true, turnComplete: true } });
  await emit(page, audio);
  expect(await page.evaluate(() => window.voiceHarness.sources.length)).toBe(3);
  await expect(page.locator('#voice-status')).toContainText('AiRA speaking');
});

test('transcript actions and duplicate Gemini requests apply repeat only once; end keeps text fallback usable', async ({ page }) => {
  await setup(page); for (let i = 0; i < 6; i++) await page.locator('#session-next').click();
  await connect(page); await speak(page);
  await emit(page, { serverContent: { inputTranscription: { text: 'Repeat that.', finished: true } } });
  await expect(page.locator('#session-title')).toHaveText('Squats');
  await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-clip', 'demonstrate_squat');
  await page.waitForTimeout(1200);
  await emit(page, { toolCall: { functionCalls: [{ id: 'repeat-after-transcript', name: 'workout_action', args: { action: 'repeat_current_block' } }] } });
  await expect.poll(() => page.evaluate(() => window.voiceHarness.sent.some(e => e.toolResponse?.functionResponses?.[0]?.id === 'repeat-after-transcript'))).toBe(true);
  expect(await page.locator('#session-timer').textContent()).not.toBe('01:00');
  await tool(page, { action: 'pause_workout' }, 'pause');
  await expect(page.locator('#session-title')).toHaveText('Session paused.'); await expect(page.locator('#session-pause')).toContainText('Resume');
  await tool(page, { action: 'end_workout' }, 'end');
  await expect(page.locator('#session-phase')).toHaveText('stopped'); await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-animation', 'end');
  await page.locator('#voice-stop').click(); await page.locator('#session-next').click();
  await expect(page.locator('#session-phase')).toHaveText('intro');
});

test('a new user activity cancels a queued tool before it can change the workout', async ({ page }) => {
  await setup(page); for (let i = 0; i < 3; i++) await page.locator('#session-next').click(); await connect(page); await speak(page);
  await page.evaluate(() => {
    window.voiceHarness.emit({ toolCall: { functionCalls: [{ id: 'old-end', name: 'workout_action', args: { action: 'end_workout' } }] } });
    window.voiceHarness.emit({ voiceActivity: { type: 'ACTIVITY_START' } });
  });
  await page.waitForTimeout(50); await expect(page.locator('#session-phase')).toHaveText('Block 01 / 03');
  expect(await page.evaluate(() => window.voiceHarness.sent.some(e => e.toolResponse?.functionResponses?.[0]?.id === 'old-end'))).toBe(false);
});

test('expired authorization and malformed playback release resources while workout text remains usable', async ({ page }) => {
  await setup(page); await connect(page);
  await page.evaluate(() => window.voiceHarness.socket.onclose({ reason: 'token expired' }));
  await expect(page.locator('#voice-error')).toContainText('authorization expired');
  await page.locator('#voice-connect').click(); await expect(page.locator('#voice-status')).toContainText('Listening');
  await speak(page);
  await emit(page, { serverContent: { modelTurn: { parts: [{ inlineData: { data: 'YQ==', mimeType: 'audio/pcm;rate=24000' } }] } } });
  await expect(page.locator('#voice-error')).toContainText('invalid event');
  expect(await page.evaluate(() => window.voiceHarness.tracksStopped)).toBe(2);
  await page.locator('#coach-input').fill('start'); await page.locator('#coach-input').press('Enter');
  await expect(page.locator('#session-phase')).toHaveText('check-in');
});

test('repeated invalid tool attempts cannot loop indefinitely or mutate the workout', async ({ page }) => {
  await setup(page); await connect(page); await speak(page);
  for (let index = 0; index < 5; index++) await emit(page, { toolCall: { functionCalls: [{ id: `invalid-${index}`, name: 'workout_action', args: { action: 'execute' } }] } });
  await expect(page.locator('#voice-error')).toContainText('could not resolve'); await expect(page.locator('#session-phase')).toHaveText('intro');
});

test('transport failure during a typed action cannot apply it twice or break local controls', async ({ page }) => {
  await setup(page); await connect(page);
  await page.evaluate(() => { const socket = window.voiceHarness.socket, send = socket.send.bind(socket); socket.send = data => { if (JSON.parse(data).realtimeInput?.text) throw Error('Synthetic connection closed'); send(data); }; });
  await page.locator('#coach-input').fill('start'); await page.locator('#coach-input').press('Enter');
  await expect(page.locator('#session-phase')).toHaveText('check-in'); await expect(page.locator('#voice-error')).toBeVisible();
  await page.locator('#session-next').click(); await expect(page.locator('#session-phase')).toHaveText('warmup');
});

test('official SDK connects with scoped token; tools update canonical timer, OpenUI and trainer', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); await setup(page);
  await expect(page.locator('#voice-connect')).toBeDisabled(); expect(await page.evaluate(() => window.voiceHarness.permissions)).toBe(0);
  for (let i = 0; i < 3; i++) await page.locator('#session-next').click(); await connect(page);
  expect(await page.evaluate(() => window.voiceHarness.scopedEndpoint)).toBe(true);
  expect(await page.evaluate(() => window.voiceHarness.sent[0].setup.model)).toBe('models/gemini-3.8-live');
  await tool(page, { action: 'set_difficulty', difficulty: 'easy' }); await expect(page.locator('#session-difficulty')).toHaveText('Gentle pace');
  expect(await page.evaluate(() => window.voiceHarness.sent.some(e => e.realtimeInput?.audio?.mimeType === 'audio/pcm;rate=16000'))).toBe(true);
  await tool(page, { action: 'request_recovery' }, 'recovery');
  await expect(page.locator('#session-phase')).toHaveText('recovery'); await expect(page.locator('#session-timer')).toHaveText('00:11');
  await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-animation', 'recover'); await expect(page.locator('#session-coach')).toContainText('Take a break');
  const result = await page.evaluate(() => window.voiceHarness.sent.find(e => e.toolResponse?.functionResponses?.[0]?.id === 'recovery').toolResponse.functionResponses[0]); expect(result.response.ok).toBe(true); expect(result.scheduling).toBe('WHEN_IDLE');
  await page.locator('#voice-stop').click(); await expect(page.locator('#voice-status')).toHaveText('Microphone off'); expect(await page.evaluate(() => window.voiceHarness.tracksStopped)).toBe(1);
  await page.locator('#coach-input').fill('next'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit()); await expect(page.locator('#session-phase')).toHaveText('adaptation'); expect(errors).toEqual([]);
});

test('Gemini PCM playback, both transcripts, interruption, mute and text fallback work continuously', async ({ page }) => {
  await setup(page); await connect(page); await speak(page);
  await emit(page, { serverContent: { inputTranscription: { text: 'Repeat that.', finished: true } } });
  await emit(page, { serverContent: { outputTranscription: { text: 'Let’s find your rhythm.' }, modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] } } });
  await expect(page.locator('#voice-status')).toContainText('AiRA speaking'); await expect(page.locator('#voice-transcript')).toContainText('You: Repeat that.'); await expect(page.locator('#voice-transcript')).toContainText('AiRA: Let’s find your rhythm.');
  await emit(page, { serverContent: { interrupted: true } }); await expect(page.locator('#voice-status')).toContainText('Listening'); expect(await page.evaluate(() => window.voiceHarness.audioStopped)).toBe(1);
  await page.locator('#coach-input').fill('What comes next?'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  expect(await page.evaluate(() => window.voiceHarness.sent.some(e => e.realtimeInput?.text?.includes('What comes next?') && e.realtimeInput.text.includes('Authoritative workout context')))).toBe(true);
  await page.locator('#voice-mute').click(); await expect(page.locator('#voice-status')).toContainText('Muted');
  expect(await page.evaluate(() => window.voiceHarness.sent.some(e => e.realtimeInput?.audioStreamEnd))).toBe(true);
  await page.locator('#voice-consent').uncheck(); await expect(page.locator('#voice-status')).toHaveText('Microphone off');
});

test('cancelled, stale, unknown, invalid and repeated function calls cannot advance the workout', async ({ page }) => {
  await setup(page); for (let i = 0; i < 3; i++) await page.locator('#session-next').click(); await connect(page); await speak(page);
  await page.locator('#session-next').click(); await emit(page, { toolCall: { functionCalls: [{ id: 'stale', name: 'workout_action', args: { action: 'advance_workout' } }] } });
  await expect.poll(() => page.evaluate(() => window.voiceHarness.sent.some(e => e.toolResponse))).toBe(true); await expect(page.locator('#session-phase')).toHaveText('recovery');
  await speak(page); await page.evaluate(() => {
    window.voiceHarness.emit({ toolCall: { functionCalls: [{ id: 'cancelled', name: 'workout_action', args: { action: 'advance_workout' } }] } });
    window.voiceHarness.emit({ toolCallCancellation: { ids: ['cancelled'] } });
  }); await page.waitForTimeout(30); await expect(page.locator('#session-phase')).toHaveText('recovery');
  expect(await page.evaluate(() => window.voiceHarness.sent.some(e => e.toolResponse?.functionResponses?.[0]?.id === 'cancelled'))).toBe(false);
  await tool(page, { action: 'advance_workout' }, 'unknown', 'execute_javascript'); await expect(page.locator('#session-phase')).toHaveText('recovery');
  await tool(page, { phase: 'adaptation', code: 'document.body.remove()' }, 'invalid'); await expect(page.locator('#session-phase')).toHaveText('recovery');
  await tool(page, { action: 'advance_workout' }, 'valid'); await expect(page.locator('#session-phase')).toHaveText('Block 02 / 03');
  await emit(page, { toolCall: { functionCalls: [{ id: 'valid', name: 'workout_action', args: { action: 'advance_workout' } }] } }); await expect(page.locator('#session-phase')).toHaveText('Block 02 / 03');
});

test('full workout can finish through voice tools with adaptation and canonical celebrations', async ({ page }) => {
  test.setTimeout(35000); await setup(page); await connect(page);
  const stages = ['checkin','warmup','active','recovery','active','recovery','active','complete'];
  for (let index = 0; index < stages.length; index++) {
    await tool(page, { action: 'advance_workout' }, `phase-${index}`);
    if (index === 2) { await tool(page, { action: 'set_difficulty', difficulty: 'easy' }, 'too-difficult'); await expect(page.locator('#session-difficulty')).toHaveText('Gentle pace'); }
  }
  await expect(page.locator('#session-phase')).toHaveText('complete'); await expect(page.locator('#session-progress [role=progressbar]')).toHaveAttribute('aria-valuenow', '100'); await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-animation', 'celebrate');
});

test('permission denial and late microphone cleanup preserve text mode', async ({ page }) => {
  await setup(page, 'denied'); await page.locator('#voice-consent').check(); await page.locator('#voice-connect').click(); await expect(page.locator('#voice-error')).toContainText('permission was denied');
  await page.locator('#coach-input').fill('start'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit()); await expect(page.locator('#session-phase')).toHaveText('check-in');
});
test('stop during a pending microphone request releases late tracks without token requests', async ({ page }) => {
  let requests = 0; page.on('request', request => { if (request.url().endsWith('/api/voice/token')) requests++; }); await setup(page, 'pending');
  await page.locator('#voice-consent').check(); await page.locator('#voice-connect').click(); await expect(page.locator('#voice-status')).toContainText('Connecting');
  await page.locator('#voice-stop').click(); await page.evaluate(() => window.voiceHarness.resolveMicrophone()); expect(await page.evaluate(() => window.voiceHarness.tracksStopped)).toBe(1); expect(requests).toBe(0);
});
test('Gemini errors and go-away release media and reconnect with current workout context', async ({ page }) => {
  await setup(page); await connect(page); await page.locator('#session-next').click(); await page.evaluate(() => window.voiceHarness.socket.onerror({}));
  await expect(page.locator('#voice-error')).toContainText('Reconnect'); expect(await page.evaluate(() => window.voiceHarness.tracksStopped)).toBe(1);
  await page.locator('#voice-connect').click(); await expect(page.locator('#voice-status')).toContainText('Listening');
  const context = await page.evaluate(() => window.voiceHarness.sent.filter(e => e.clientContent).at(-1).clientContent.turns[0].parts[0].text); expect(context).toContain('checkin');
  await emit(page, { goAway: { timeLeft: '1s' } }); await expect(page.locator('#voice-error')).toContainText('Reconnect'); await expect(page.locator('#session-phase')).toHaveText('check-in');
});
test('voice transcripts and ephemeral tokens are absent from exports', async ({ page }) => {
  await setup(page); await connect(page); await speak(page); await emit(page, { serverContent: { inputTranscription: { text: 'SYNTHETIC_PRIVATE_VOICE_TEXT' } } });
  await page.locator('.settings').evaluate(element => element.open = true); await page.locator('.builder').evaluate(element => element.open = true); await page.locator('#sample').click(); await expect(page.locator('#export')).toBeEnabled();
  const pending = page.waitForEvent('download'); await page.locator('#export').click(); const download = await pending; const payload = await readFile(await download.path(), 'utf8');
  expect(payload).not.toContain('SYNTHETIC_PRIVATE_VOICE_TEXT'); expect(payload).not.toContain('auth_tokens/fake');
});
test('depleted Gemini credits release the microphone and show a useful reconnect error', async ({ page }) => {
  await setup(page); await connect(page);
  await page.evaluate(() => window.voiceHarness.socket.onclose({ code: 1011, reason: 'Your prepayment credits are depleted.' }));
  await expect(page.locator('#voice-error')).toContainText('Gemini API credits are unavailable');
  await expect(page.locator('#voice-connect')).toBeEnabled();
  expect(await page.evaluate(() => window.voiceHarness.tracksStopped)).toBe(1);
  await page.locator('#coach-input').fill('start'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#session-phase')).toHaveText('check-in');
});

test('voice feedback is visible in the primary surface without repeated status announcements', async ({ page }) => {
  await setup(page); await expect(page.locator('#voice-empty')).toBeVisible(); await connect(page);
  await expect(page.locator('#coach-runtime')).toContainText('Listening');
  await page.evaluate(() => { window.statusMutations = 0; new MutationObserver(records => window.statusMutations += records.length).observe(document.querySelector('#voice-status'), { childList: true }); for (let i = 0; i < 20; i++) window.voiceHarness.chunk(0.1); });
  expect(await page.evaluate(() => window.statusMutations)).toBe(0);
  await emit(page, { voiceActivity: { type: 'ACTIVITY_END' } });
  await emit(page, { serverContent: { outputTranscription: { text: 'At your pace.' }, modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] } } });
  await expect(page.locator('#coach-runtime')).toContainText('AiRA speaking'); await expect(page.locator('#voice-empty')).toBeHidden();
  await page.locator('#voice-mute').click(); await expect(page.locator('#coach-runtime')).toContainText('muted');
  await page.locator('#voice-panel').press('Escape'); await expect(page.locator('#voice-panel')).toBeHidden(); await expect(page.locator('#session-voice')).toBeFocused();
  await page.locator('#session-voice').click(); await page.locator('#voice-stop').click(); await expect(page.locator('#coach-runtime')).toContainText('text coaching');
});

test('missing Gemini credentials never request audio or tokens; mock/text still work', async ({ page }) => {
  let calls = 0; page.on('request', request => { if (request.url().endsWith('/api/voice/token')) calls++; }); await page.goto('/'); await page.locator('#session-voice').click(); await expect(page.locator('#voice-status')).toHaveText('Voice unavailable');
  await page.locator('#voice-consent').check(); await expect(page.locator('#voice-connect')).toBeDisabled(); expect(calls).toBe(0);
  await page.locator('#coach-input').fill('start'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit()); await expect(page.locator('#session-phase')).toHaveText('check-in');
  await page.locator('.settings').evaluate(element => element.open = true); await page.locator('.builder').evaluate(element => element.open = true); await page.locator('#sample').click(); await expect(page.locator('#screen')).toContainText('Sample');
});


test('spoken tired check-in and struggle share text policy without double adaptation', async ({ page }) => {
  await setup(page); await connect(page);
  await tool(page, { action: 'advance_workout' }, 'begin');
  await speak(page); await emit(page, { serverContent: { inputTranscription: { text: "I'm tired. Keep it easy.", finished: true } } });
  await expect(page.locator('#session-phase')).toHaveText('check-in');
  await expect(page.locator('#session-difficulty')).toHaveText('Gentle pace');
  await tool(page, { action: 'advance_workout' }, 'warmup');
  await tool(page, { action: 'advance_workout' }, 'block');
  await speak(page); await emit(page, { serverContent: { inputTranscription: { text: 'This is too difficult.', finished: true } } });
  await expect(page.locator('#session-coach')).toContainText('28 seconds instead of 42');
  await emit(page, { toolCall: { functionCalls: [{ id: 'adapt-ack', name: 'workout_action', args: { action: 'ease_and_recover' } }] } });
  await expect.poll(() => page.evaluate(() => window.voiceHarness.sent.some(e => e.toolResponse?.functionResponses?.some(r => r.id === 'adapt-ack')))).toBe(true);
  await expect(page.locator('.trainer-view')).toHaveAttribute('data-animation', 'recover');
  await tool(page, { action: 'advance_workout' }, 'continue');
  await expect(page.locator('#session-title')).toHaveText('Squats'); await expect(page.locator('#session-timer')).toHaveText('00:28');
  await page.locator('#voice-stop').click();
  await page.locator('#coach-input').fill('Pause'); await page.locator('#coach-input').press('Enter');
  await expect(page.locator('#session-title')).toHaveText('Session paused.');
});


test('timer-driven phase changes queue one spoken cue and cannot execute autonomous tools', async ({ page }) => {
  await setup(page); await page.clock.install();
  await page.locator('#session-next').click(); await page.locator('#session-next').click(); await connect(page);
  await page.clock.fastForward(31000);
  await expect(page.locator('#session-phase')).toHaveText('Block 01 / 03');
  const cues = () => page.evaluate(() => window.voiceHarness.sent.filter(e => e.clientContent?.turnComplete && e.clientContent.turns?.some(t => t.parts?.some(p => p.text?.startsWith('The local workout timer')))).length);
  await expect.poll(cues).toBe(1);
  await emit(page, { toolCall: { functionCalls: [{ id: 'autonomous-skip', name: 'workout_action', args: { action: 'skip_current_block' } }] } });
  await page.clock.runFor(10);
  await expect(page.locator('#session-phase')).toHaveText('Block 01 / 03');
  await page.clock.fastForward(1000); expect(await cues()).toBe(1);
});


test('voice transcripts stream into the adjacent chat without duplicating partial bubbles', async ({ page }) => {
  await setup(page); await connect(page); await speak(page);
  await emit(page, { serverContent: { inputTranscription: { text: 'How are ' } } });
  await emit(page, { serverContent: { inputTranscription: { text: 'we doing?' } } });
  await expect(page.locator('#coach-history .chat-user')).toHaveCount(1);
  await expect(page.locator('#coach-history .chat-user')).toContainText('How are we doing?');
  await emit(page, { serverContent: { outputTranscription: { text: 'We are ' } } });
  await emit(page, { serverContent: { outputTranscription: { text: 'finding your rhythm.' } } });
  await expect(page.locator('#coach-history [data-transcript-id^="AiRA-"]')).toHaveCount(1);
  await expect(page.locator('#coach-history')).toContainText('We are finding your rhythm.');
});


test('background noise and short spikes do not truncate a multi-chunk coach reply', async ({ page }) => {
  await setup(page); await connect(page); await speak(page);
  const audio = { serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] } } };
  await emit(page, audio);
  await page.evaluate(() => { for (let i = 0; i < 20; i++) window.voiceHarness.chunk(0.02); window.voiceHarness.chunk(0.1); window.voiceHarness.chunk(0); });
  await emit(page, audio); await emit(page, audio);
  expect(await page.evaluate(() => window.voiceHarness.audioStopped)).toBe(0);
  expect(await page.evaluate(() => window.voiceHarness.sources.length)).toBe(3);
  await emit(page, { serverContent: { turnComplete: true } });
  await expect(page.locator('#voice-status')).toContainText('AiRA speaking');
  await page.evaluate(() => window.voiceHarness.finishAudio());
  await expect(page.locator('#voice-status')).toContainText('Listening');
});

test('passive workout context waits for provider completion AND the final playback buffer', async ({ page }) => {
  await setup(page); await connect(page); await speak(page);
  await emit(page, { serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] } } });
  const contexts = () => page.evaluate(() => window.voiceHarness.sent.filter(e => e.clientContent).length);
  const before = await contexts();
  await page.locator('#session-next').click();
  await page.waitForTimeout(300); expect(await contexts()).toBe(before);
  await emit(page, { serverContent: { turnComplete: true } });
  await page.waitForTimeout(300); expect(await contexts()).toBe(before);
  await page.evaluate(() => window.voiceHarness.finishAudio());
  await expect.poll(contexts).toBe(before + 1);
  await expect(page.locator('#voice-status')).toContainText('Listening');
});

test('sustained speech still interrupts promptly without a provider activity event', async ({ page }) => {
  await setup(page); await connect(page);
  await emit(page, { serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] } } });
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.voiceHarness.chunk(0.1); });
  expect(await page.evaluate(() => window.voiceHarness.audioStopped)).toBe(1);
  await expect(page.locator('#voice-status')).toContainText('Listening');
});


test('a temporary empty audio queue does not send context into ongoing provider generation', async ({ page }) => {
  await setup(page); await connect(page); await speak(page);
  const audio = { serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] } } };
  await emit(page, audio); await page.evaluate(() => window.voiceHarness.finishAudio());
  await expect(page.locator('#voice-status')).toContainText('Thinking');
  const before = await page.evaluate(() => window.voiceHarness.sent.filter(e => e.clientContent).length);
  await page.locator('#session-next').click(); await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.voiceHarness.sent.filter(e => e.clientContent).length)).toBe(before);
  await emit(page, audio); await emit(page, { serverContent: { turnComplete: true } });
  expect(await page.evaluate(() => window.voiceHarness.audioStopped)).toBe(0);
  await page.evaluate(() => window.voiceHarness.finishAudio());
  await expect.poll(() => page.evaluate(() => window.voiceHarness.sent.filter(e => e.clientContent).length)).toBe(before + 1);
});

test('provider speech-end releases the activity latch for later local silence fallback', async ({ page }) => {
  await setup(page); await page.clock.install(); await connect(page); await speak(page);
  await emit(page, { serverContent: { turnComplete: true } });
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.voiceHarness.chunk(0.1); });
  await page.clock.fastForward(1000); await page.evaluate(() => window.voiceHarness.chunk(0));
  await expect(page.locator('#voice-status')).toContainText('Thinking');
});
