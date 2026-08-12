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

test('accepts the complete ResolutionSelector ratio list and quality options', () => {
  for (const aspectRatio of ['1:1 (Square)', '2:3 (Portrait Photo)', '3:2 (Photo)', '3:4 (Portrait Standard)', '4:3 (Standard)', '9:16 (Portrait Widescreen)', '16:9 (Widescreen)']) {
    const value = validateJobInput({ prompt: 'flower', aspectRatio, megapixels: 16, seed: 123, refinePrompt: true, enableLora: true, upscale: true });
    assert.equal(value.aspectRatio, aspectRatio);
    assert.equal(value.megapixels, 16);
  }
});

test('accepts one-decimal megapixels from 1.0 through 16.0', () => {
  assert.equal(validateJobInput({ prompt: 'x', megapixels: 1.1 }).megapixels, 1.1);
  assert.equal(validateJobInput({ prompt: 'x', megapixels: 8.7 }).megapixels, 8.7);
  assert.equal(validateJobInput({ prompt: 'x', megapixels: 16 }).megapixels, 16);
  assert.throws(() => validateJobInput({ prompt: 'x', megapixels: 0.9 }), /1.0 到 16.0/);
  assert.throws(() => validateJobInput({ prompt: 'x', megapixels: 16.1 }), /1.0 到 16.0/);
});
