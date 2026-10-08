import { test, expect } from '@playwright/test';

test('AiRA loads a local animated trainer and exposes a clean session surface', async ({ page }) => {
  const errors = []; const remote = []; page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4320')) remote.push(request.url()); });
  await page.goto('/'); await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-animation', 'greet');
  await expect(page.locator('#sample')).toBeHidden(); await expect(page.locator('#session-title')).toHaveText('Your next good move.');
  await page.locator('#session-next').click(); await expect(page.locator('#session-phase')).toHaveText('check-in');
  await page.locator('#energy-gentle').click(); await expect(page.locator('#session-difficulty')).toHaveText('Gentle pace');
  await page.locator('#session-next').click(); await expect(page.locator('#session-phase')).toHaveText('warmup');
  await page.locator('#session-pause').click(); const timer = await page.locator('#session-timer').textContent();
  await page.waitForTimeout(1100); await expect(page.locator('#session-timer')).toHaveText(timer);
  await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-paused', 'true');
  await page.locator('#session-pause').click(); await page.locator('#coach-input').fill('easier'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#session-coach')).toContainText('gentler pace');
  for (let i = 0; i < 7; i++) await page.locator('#session-next').click();
  await expect(page.locator('#session-phase')).toHaveText('complete'); await expect(page.locator('#session-progress [role=progressbar]')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-animation', 'celebrate');
  await page.locator('#session-restart').click(); await expect(page.locator('#session-phase')).toHaveText('intro');
  expect(errors).toEqual([]); expect(remote).toEqual([]);
  await page.locator('#session-title').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({ path: 'evidence/screenshots/aira-desktop.png', fullPage: true });
});

test('mobile layout fits and voice entry does not request audio capabilities', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-loaded', 'true');
  await page.locator('#session-voice').click(); await expect(page.locator('#voice-note')).toContainText('microphone stays off');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'evidence/screenshots/aira-mobile.png', fullPage: true });
});

test('reduced motion and unavailable WebGL keep session controls usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { const native = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { if (String(type).startsWith('webgl')) return null; return native.call(this, type, ...args); }; });
  await page.goto('/'); await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-loaded', 'fallback');
  await page.locator('#session-next').click(); await expect(page.locator('#session-phase')).toHaveText('check-in');
});

test('primary live text requires consent, includes canonical context and retries visible errors', async ({ page }) => {
  let calls = 0, captured;
  await page.route('**/api/config', async route => {
    const response = await route.fetch(); const config = await response.json();
    config.providers.find(provider => provider.id === 'openai-api').enabled = true;
    await route.fulfill({ json: config });
  });
  await page.route('**/api/turn', async route => {
    calls++; captured = route.request().postDataJSON();
    if (calls === 1) await route.fulfill({ status: 502, json: { error: 'Synthetic provider failure.' } });
    else await route.fulfill({ json: { turn: { reply: 'Let’s explore this preview together, at your pace.' }, versions: { provider: 'openai-api', mode: 'live', model: 'fixture-only' } } });
  });
  await page.goto('/'); await page.locator('.settings').evaluate(element => element.open = true);
  await page.locator('#provider').selectOption('openai-api');
  await page.locator('#coach-input').fill('Tell me about this session'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#coach-feedback')).toContainText('agree to usage'); expect(calls).toBe(0);
  await page.locator('#consent').check();
  await page.locator('#coach-input').fill('Tell me about this session'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#coach-feedback')).toContainText('Synthetic provider failure');
  await page.locator('#coach-retry').click(); await expect(page.locator('#session-coach')).toContainText('at your pace');
  expect(captured.consent).toBe(true); expect(captured.state.client_events.some(event => event.includes('Workout snapshot'))).toBe(true);
  await page.locator('#coach-input').fill('next'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#session-phase')).toHaveText('check-in'); expect(calls).toBe(2);
});

test('delayed coaching survives elapsed ticks and is rejected after a phase change', async ({ page }) => {
  await page.route('**/api/config', async route => {
    const response = await route.fetch(); const config = await response.json(); config.providers.find(provider => provider.id === 'openai-api').enabled = true;
    await route.fulfill({ json: config });
  });
  let calls = 0;
  await page.route('**/api/turn', async route => {
    const count = ++calls; await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fulfill({ json: { turn: { reply: count === 1 ? 'A cue for this active block.' : 'Outdated active block cue.' }, versions: { provider: 'openai-api', mode: 'live', model: 'fixture-only' } } });
  });
  await page.goto('/');
  for (let i = 0; i < 3; i++) await page.locator('#session-next').click();
  await page.locator('.settings').evaluate(element => element.open = true); await page.locator('#provider').selectOption('openai-api'); await page.locator('#consent').check();
  await page.locator('#coach-input').fill('Share a coaching cue'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#session-coach')).toHaveText('✦A cue for this active block.');
  await page.locator('#coach-input').fill('Another coaching cue'); await page.locator('#coach-composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#coach-cancel')).toBeVisible(); await page.locator('#session-next').click();
  await expect(page.locator('#session-phase')).toHaveText('recovery'); await expect(page.locator('#coach-cancel')).toBeHidden();
  await expect(page.locator('#session-coach')).not.toContainText('Outdated');
});
