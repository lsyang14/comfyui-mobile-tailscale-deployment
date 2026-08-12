export const ASPECT_RATIOS = new Set([
  '1:1', '3:4', '4:3', '9:16', '16:9',
  '3:4 (Portrait Standard)'
]);

export function validateJobInput(input) {
  if (!input || typeof input !== 'object') throw new Error('请求体必须是 JSON 对象');
  const prompt = typeof input.prompt === 'string' ? input.prompt.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  if (!prompt || prompt.length > 1000) throw new Error('prompt 必须为 1-1000 个字符');
  const aspectRatio = input.aspectRatio ?? '3:4 (Portrait Standard)';
  if (!ASPECT_RATIOS.has(aspectRatio)) throw new Error('不支持的 aspectRatio');
  const megapixels = input.megapixels ?? 1;
  if (![1, 2].includes(megapixels)) throw new Error('不支持的 megapixels');
  const seed = input.seed === undefined ? -1 : Number(input.seed);
  if (!Number.isSafeInteger(seed) || seed < -1) throw new Error('seed 必须是 -1 或安全整数');
  return {
    prompt,
    aspectRatio,
    megapixels,
    seed,
    refinePrompt: Boolean(input.refinePrompt),
    enableLora: Boolean(input.enableLora),
    upscale: Boolean(input.upscale)
  };
}
