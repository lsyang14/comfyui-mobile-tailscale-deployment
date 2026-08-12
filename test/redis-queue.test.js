import test from 'node:test';
import assert from 'node:assert/strict';
import { RedisJobQueue } from '../src/redis-queue.js';

test('uses a dedicated Redis connection for the blocking worker', () => {
  const queue = new RedisJobQueue();
  assert.notEqual(queue.client, queue.workerClient);
});
