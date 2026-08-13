import { readFile } from 'node:fs/promises';
import { validateJobInput } from './validation.js';

export async function buildWorkflow(input, workflowPath) {
  const options = validateJobInput(input);
  const template = JSON.parse(await readFile(workflowPath, 'utf8'));
  const workflow = structuredClone(template);
  if (options.workflow === 'krea2-hd4k') {
    workflow['627'].inputs.text = options.prompt;
    workflow['848'].inputs.aspect_ratio = options.aspectRatio;
    workflow['848'].inputs.megapixels = 1.5;
    workflow['649'].inputs.seed = options.seed === -1 ? Math.floor(Math.random() * 1_000_000_000_000_000) : options.seed;
    workflow['711'].inputs.blend_factor = options.skinContrastStrength;
    workflow['711'].inputs.blend_mode = options.skinContrastMode;
    workflow['713'].inputs.resolution = options.seedvrResolution;
    workflow['713'].inputs.max_resolution = options.seedvrResolution;
    return { workflow, options };
  }
  workflow['165:148'].inputs.value = options.prompt;
  workflow['165:153'].inputs.value = options.refinePrompt;
  workflow['165:152'].inputs.value = options.enableLora;
  workflow['166'].inputs.aspect_ratio = options.aspectRatio;
  workflow['166'].inputs.megapixels = options.megapixels;
  workflow['165:138'].inputs.seed = options.seed === -1 ? Math.floor(Math.random() * 1_000_000_000_000_000) : options.seed;
  return { workflow, options };
}

export function findImageOutput(historyEntry, upscale) {
  const preferred = '167';
  const outputs = historyEntry?.outputs ?? {};
  const candidates = [outputs[preferred], ...Object.values(outputs)];
  for (const output of candidates) {
    const image = output?.images?.[0];
    if (image?.filename) return { filename: image.filename, subfolder: image.subfolder ?? '', type: image.type ?? 'output' };
  }
  throw new Error('ComfyUI 历史记录中没有图片输出');
}
