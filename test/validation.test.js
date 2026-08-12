import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJobInput } from '../src/validation.js';

test('accepts a valid mobile generation request and applies defaults', () => {
  assert.deepEqual(validateJobInput({ prompt: ' cat ', aspectRatio: '3:4' }), {
    prompt: 'cat', aspectRatio: '3:4', megapixels: 1, seed: -1,
    refinePrompt: false, enableLora: false, upscale: false
  });
});

test('rejects arbitrary aspect ratios and oversized prompts', () => {
  assert.throws(() => validateJobInput({ prompt: 'x', aspectRatio: '999:999' }), /aspectRatio/);
  assert.throws(() => validateJobInput({ prompt: 'x'.repeat(1001) }), /1-1000/);
});
