import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkflowPath } from '../src/paths.js';

test('converts the default workflow URL to a valid Windows filesystem path', () => {
  const path = defaultWorkflowPath(new URL('../src/server.js', import.meta.url).href);
  assert.match(path, /workflow-krea2\.json$/);
  assert.doesNotMatch(path, /^E:\\E:/);
});
