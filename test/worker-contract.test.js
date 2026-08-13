import test from 'node:test';
import assert from 'node:assert/strict';
import { workerWsUrl, parseWorkerMessage, workerMessage } from '../src/worker-client.js';

test('worker client builds a WSS endpoint from the public server URL', () => {
  assert.equal(workerWsUrl('https://ai.example.com', 'secret'), 'wss://ai.example.com/api/worker/ws');
  assert.equal(workerWsUrl('http://localhost:3000/', 'a b'), 'ws://localhost:3000/api/worker/ws');
});

test('worker protocol rejects malformed messages and normalizes valid messages', () => {
  assert.equal(parseWorkerMessage('not-json'), null);
  assert.equal(parseWorkerMessage(JSON.stringify({ type: 'unknown' })), null);
  assert.deepEqual(parseWorkerMessage(JSON.stringify({ type: 'hello', workerId: 'w1' })), { type: 'hello', workerId: 'w1' });
});

test('worker messages are JSON envelopes', () => {
  assert.equal(workerMessage('progress', { jobId: 'j1', percent: 50 }), JSON.stringify({ type: 'progress', jobId: 'j1', percent: 50 }));
});
