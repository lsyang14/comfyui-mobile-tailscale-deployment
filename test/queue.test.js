import test from 'node:test';
import assert from 'node:assert/strict';
import { JobQueue } from '../src/queue.js';

test('runs jobs one at a time in FIFO order and reports queue position', async () => {
  const queue = new JobQueue({ maxSize: 3 });
  const events = []; let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  queue.add('a', async () => { events.push('a-start'); await blocker; events.push('a-end'); });
  queue.add('b', async () => { events.push('b-start'); });
  assert.equal(queue.position('b'), 1);
  release();
  await queue.idle();
  assert.deepEqual(events, ['a-start', 'a-end', 'b-start']);
});

test('rejects jobs beyond the configured queue capacity', () => {
  const queue = new JobQueue({ maxSize: 1 });
  queue.add('a', async () => new Promise(() => {}));
  assert.throws(() => queue.add('b', async () => {}), /队列已满/);
});
