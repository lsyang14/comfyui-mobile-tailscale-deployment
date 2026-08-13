export const ASPECT_RATIOS = new Set([
  '1:1', '1:1 (Square)', '2:3 (Portrait Photo)', '3:2 (Photo)',
  '3:4', '3:4 (Portrait Standard)', '4:3', '4:3 (Standard)',
  '9:16', '9:16 (Portrait Widescreen)', '16:9', '16:9 (Widescreen)', '21:9 (Ultrawide)'
]);
export const WORKFLOWS = new Set(['krea2-turbo', 'krea2-hd4k']);
export const SKIN_MODES = new Set(['normal', 'multiply', 'screen', 'overlay', 'soft_light', 'difference']);

export function validateJobInput(input) {
  if (!input || typeof input !== 'object') throw new Error('请求体必须是 JSON 对象');
  const prompt = typeof input.prompt === 'string' ? input.prompt.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  if (!prompt || prompt.length > 1000) throw new Error('prompt 必须为 1-1000 个字符');
  const workflow = input.workflow ?? 'krea2-turbo';
  if (!WORKFLOWS.has(workflow)) throw new Error('不支持的 workflow');
  const aspectRatio = input.aspectRatio ?? '3:4 (Portrait Standard)';
  if (!ASPECT_RATIOS.has(aspectRatio)) throw new Error('不支持的 aspectRatio');
  const megapixels = input.megapixels ?? 1;
  if (!Number.isFinite(Number(megapixels)) || Number(megapixels) < 1 || Number(megapixels) > 16) throw new Error('megapixels 必须在 1.0 到 16.0 之间');
  const seed = input.seed === undefined ? -1 : Number(input.seed);
  if (!Number.isSafeInteger(seed) || seed < -1) throw new Error('seed 必须是 -1 或安全整数');
  const skinContrast = Boolean(input.skinContrast);
  const skinContrastStrength = input.skinContrastStrength === undefined ? 0.2 : Number(input.skinContrastStrength);
  if (!Number.isFinite(skinContrastStrength) || skinContrastStrength < 0 || skinContrastStrength > 1) throw new Error('skinContrastStrength 必须在 0 到 1 之间');
  const skinContrastMode = input.skinContrastMode ?? 'normal';
  if (!SKIN_MODES.has(skinContrastMode)) throw new Error('不支持的 skinContrastMode');
  const seedvrResolution = input.seedvrResolution === undefined ? 4096 : Number(input.seedvrResolution);
  if (!Number.isInteger(seedvrResolution) || seedvrResolution < 1024 || seedvrResolution > 8192 || seedvrResolution % 256 !== 0) throw new Error('seedvrResolution 必须是 1024-8192 的 256 倍数');
  const result = {
    prompt,
    aspectRatio,
    megapixels: Math.round(Number(megapixels) * 10) / 10,
    seed,
    refinePrompt: Boolean(input.refinePrompt),
    enableLora: Boolean(input.enableLora),
    upscale: Boolean(input.upscale)
  };
  if (input.workflow !== undefined || input.skinContrast !== undefined || input.seedvrResolution !== undefined) Object.assign(result, { workflow, skinContrast, skinContrastStrength: skinContrast ? skinContrastStrength : 0, skinContrastMode, seedvrResolution });
  return result;
}
