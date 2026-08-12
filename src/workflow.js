import { readFile } from 'node:fs/promises';
import { validateJobInput } from './validation.js';

export async function buildWorkflow(input, workflowPath) {
  const options = validateJobInput(input);
  const template = JSON.parse(await readFile(workflowPath, 'utf8'));
  const workflow = structuredClone(template);
  workflow['162:148'].inputs.value = options.prompt;
  workflow['162:153'].inputs.value = options.refinePrompt;
  workflow['162:152'].inputs.value = options.enableLora;
  workflow['156'].inputs.aspect_ratio = options.aspectRatio;
  workflow['156'].inputs.megapixels = options.megapixels;
  workflow['162:138'].inputs.seed = options.seed === -1 ? Math.floor(Math.random() * 1_000_000_000_000_000) : options.seed;
  workflow['159:127'].inputs.seed = options.seed === -1 ? Math.floor(Math.random() * 1_000_000_000_000_000) : options.seed;
  return { workflow, options };
}

export function findImageOutput(historyEntry, upscale) {
  const preferred = upscale ? '157' : '161';
  const outputs = historyEntry?.outputs ?? {};
  const candidates = [outputs[preferred], ...Object.values(outputs)];
  for (const output of candidates) {
    const image = output?.images?.[0];
    if (image?.filename) return { filename: image.filename, subfolder: image.subfolder ?? '', type: image.type ?? 'output' };
  }
  throw new Error('ComfyUI 历史记录中没有图片输出');
}
