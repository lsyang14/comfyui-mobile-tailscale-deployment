import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflow, findImageOutput } from '../src/workflow.js';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('maps only allow-listed values into the API workflow', async () => {
  const path = join(tmpdir(), `workflow-${Date.now()}.json`);
  await writeFile(path, JSON.stringify({
    '165:148': { inputs: { value: 'old' } }, '165:153': { inputs: { value: false } },
    '165:152': { inputs: { value: false } }, '166': { inputs: { aspect_ratio: 'old', megapixels: 1 } },
    '165:138': { inputs: { seed: 1 } }, secret: { inputs: { value: 'unchanged' } }
  }));
  const { workflow, options } = await buildWorkflow({ prompt: 'hello', enableLora: true, seed: 42 }, path);
  assert.equal(workflow['165:148'].inputs.value, 'hello');
  assert.equal(workflow['165:152'].inputs.value, true);
  assert.equal(workflow.secret.inputs.value, 'unchanged');
  assert.equal(options.seed, 42);
});

test('prefers the requested SaveImage node output', () => {
  assert.deepEqual(findImageOutput({ outputs: { '167': { images: [{ filename: 'main.png' }] } } }, true), { filename: 'main.png', subfolder: '', type: 'output' });
});
