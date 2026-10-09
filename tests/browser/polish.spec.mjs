import { test, expect } from '@playwright/test';

test('mobile opening keeps Start visible, readable text input and diagnostics out of the main surface', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-loaded', 'true');
  const start = await page.locator('#session-next').boundingBox(); expect(start.y + start.height).toBeLessThan(844);
  const voice = await page.locator('#session-voice').boundingBox(); expect(voice.y + voice.height).toBeLessThanOrEqual(844);
  expect(voice.y).toBeGreaterThan(0);
  await expect(page.locator('.builder > summary')).toBeHidden();
  expect(await page.locator('#coach-input').evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.settings summary').first().click(); await expect(page.locator('.builder > summary')).toBeVisible();
});

test('keyboard and double activation preserve authored stages and text can complete the adapted session', async ({ page }) => {
  await page.goto('/'); await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused(); await page.keyboard.press('Enter'); await expect(page.locator('main')).toBeFocused();
  await page.locator('#session-next').dblclick(); await expect(page.locator('#session-phase')).toHaveText('check-in');
  await expect(page.locator('#session-timer')).toHaveText('—');
  await page.locator('#energy-gentle').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#energy-gentle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#session-next').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#session-phase')).toHaveText('warmup');
  await page.locator('#session-next').dispatchEvent('keydown', { key: 'Enter', repeat: true }); await expect(page.locator('#session-phase')).toHaveText('warmup');
  await page.keyboard.press('Enter'); await expect(page.locator('#session-title')).toContainText('Standing march');
  const message = async text => { await page.locator('#coach-input').fill(text); await page.locator('#coach-input').press('Enter'); };
  await expect(page.locator('#coach-send')).toBeDisabled();
  await message('This is too difficult.');
  await expect(page.locator('#session-difficulty')).toHaveText('Gentle pace'); await expect(page.locator('#session-title')).toContainText('Recovery');
  await message('I need a recovery.'); await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-animation', 'recover');
  await message('next'); await expect(page.locator('#session-phase')).toHaveText('adaptation'); await expect(page.locator('#session-timer')).toHaveText('—');
  for (let i = 0; i < 4; i++) await message('next');
  await expect(page.locator('#session-phase')).toHaveText('complete'); await expect(page.locator('#trainer-mount .trainer-view')).toHaveAttribute('data-animation', 'celebrate');
  await expect(page.locator('#session-next')).toBeFocused(); await expect(page.locator('#coach-send')).toBeDisabled(); await expect(page.locator('#session-progress [role=progressbar]')).toHaveAttribute('aria-valuenow', '100');
});

test('loading and failed local trainer retain the current canonical animation and usable controls', async ({ page }) => {
  let release; await page.route('**/aira-trainer.glb', async route => { await new Promise(resolve => release = resolve); await route.fulfill({ status: 404, body: '' }); });
  await page.goto('/'); const trainer = page.locator('#trainer-mount .trainer-view');
  await expect(trainer).toHaveAttribute('aria-busy', 'true'); await expect(trainer).toContainText('getting ready');
  for (let i = 0; i < 3; i++) await page.locator('#session-next').click();
  await expect(trainer).toHaveAttribute('data-animation', 'active'); release();
  await expect(trainer).toHaveAttribute('data-loaded', 'fallback'); await expect(trainer).toHaveAttribute('aria-busy', 'false');
  await page.locator('#session-next').click(); await expect(trainer).toHaveAttribute('data-animation', 'recover'); await expect(trainer).toHaveAttribute('aria-label', /recover/);
});


test('dark studio keeps conversation beside the trainer and quick requests update the same workout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  const trainer = await page.locator('.trainer-stage').boundingBox(), chat = await page.locator('.interaction-panel').boundingBox();
  expect(chat.x).toBeGreaterThanOrEqual(trainer.x + trainer.width - 1);
  expect(Math.abs(chat.y - trainer.y)).toBeLessThan(2);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
  await expect(page.locator('#coach-history')).toContainText('Hi, I’m AiRA');
  await page.locator('[data-coach-message="Make the next one easier"]').click();
  await expect(page.locator('#session-difficulty')).toHaveText('Gentle pace');
  await expect(page.locator('#coach-history .chat-user')).toHaveCount(1);
  await expect(page.locator('#coach-history')).toContainText('Your shorter plan is ready');
  await expect(page.locator('#coach-input')).toBeFocused();
  await page.locator('#session-next').click(); await page.locator('#session-next').click();
  await page.locator('[data-coach-message="I need a recovery"]').click();
  await expect(page.locator('#session-phase')).toHaveText('recovery');
  await expect(page.locator('.trainer-view')).toHaveAttribute('data-animation', 'recover');
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('compact call card keeps the composer visible while conversation scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 }); await page.goto('/');
  await expect(page.locator('.trainer-view')).toHaveAttribute('data-loaded', 'true');
  const input = page.locator('#coach-composer');
  const before = await input.boundingBox(); expect(before.y + before.height).toBeLessThan(768);
  expect((await page.locator('.voice-spotlight').boundingBox()).height).toBeLessThan(180);
  for (let i = 0; i < 12; i++) await page.locator('[data-coach-message="What comes next?"]').evaluate(button => button.click());
  const history = await page.locator('#coach-history').evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight, overflow: getComputedStyle(element).overflowY }));
  expect(history.content).toBeGreaterThan(history.height); expect(history.overflow).toBe('auto');
  const after = await input.boundingBox(); expect(after.y + after.height).toBeLessThan(768);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
});
