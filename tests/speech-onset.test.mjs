import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechOnset } from '../dist/web/speech-onset.js';
test('speech onset ignores background and isolated spikes, confirms sustained speech at any input rate', () => {
  const gate = new SpeechOnset();
  for (let i = 0; i < 100; i++) assert.equal(gate.observe(0.02, 32, true), false);
  assert.equal(gate.observe(0.1, 32, true), false); assert.equal(gate.observe(0, 32, true), false);
  gate.reset(); for (let i = 0; i < 3; i++) assert.equal(gate.observe(0.1, 32, true), false);
  assert.equal(gate.observe(0.1, 32, true), true);
  gate.reset(); for (let i = 0; i < 8; i++) assert.equal(gate.observe(0.05, 512 / 48000 * 1000, false), false);
  assert.equal(gate.observe(0.05, 512 / 48000 * 1000, false), true);
  gate.reset(); assert.equal(gate.observe(NaN, 32, false), false);
});
