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

test('maps HD4K controls without changing the default megapixels or skin model', async () => {
  const path = join(tmpdir(), `hd4k-${Date.now()}.json`);
  await writeFile(path, JSON.stringify({
    '627': { inputs: { text: 'old' } }, '848': { inputs: { aspect_ratio: 'old', megapixels: 1.5 } },
    '649': { inputs: { seed: 1 } }, '711': { inputs: { blend_factor: 0.2, blend_mode: 'normal' } },
    '713': { inputs: { resolution: 4096, max_resolution: 4096 } }, '702': { inputs: { model_name: 'default.pth' } }
  }));
  const { workflow } = await buildWorkflow({ workflow: 'krea2-hd4k', prompt: 'new', aspectRatio: '16:9 (Widescreen)', seed: 99, skinContrast: true, skinContrastStrength: 0.7, skinContrastMode: 'overlay', seedvrResolution: 6144 }, path);
  assert.equal(workflow['627'].inputs.text, 'new');
  assert.equal(workflow['848'].inputs.aspect_ratio, '16:9 (Widescreen)');
  assert.equal(workflow['848'].inputs.megapixels, 1.5);
  assert.equal(workflow['649'].inputs.seed, 99);
  assert.equal(workflow['711'].inputs.blend_factor, 0.7);
  assert.equal(workflow['711'].inputs.blend_mode, 'overlay');
  assert.equal(workflow['713'].inputs.resolution, 6144);
  assert.equal(workflow['713'].inputs.max_resolution, 6144);
  assert.equal(workflow['702'].inputs.model_name, 'default.pth');
});
