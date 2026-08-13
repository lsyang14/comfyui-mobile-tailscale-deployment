import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { WorkerBroker } from '../src/worker-broker.js';
import { workerMessage } from '../src/worker-client.js';

test('broker registers an outbound worker and dispatches one job', async () => {
  const server = http.createServer();
  const broker = new WorkerBroker({ token: 'secret' }).attach(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/worker/ws`, { headers: { authorization: 'Bearer secret' } });
  await new Promise((resolve) => socket.once('open', resolve));
  socket.send(workerMessage('hello', { workerId: 'GPU-01' }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const resultPromise = broker.run({ id: 'job-1', input: { prompt: 'cat' } });
  const message = await new Promise((resolve) => socket.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
  assert.equal(message.type, 'job');
  assert.equal(message.jobId, 'job-1');
  socket.send(workerMessage('result', { jobId: 'job-1', filename: 'cat.png', imageBase64: 'aW1hZ2U=' }));
  const result = await resultPromise;
  assert.equal(result.filename, 'cat.png');
  socket.terminate();
  broker.wss.clients.forEach((client) => client.terminate());
  broker.wss.close();
  server.closeAllConnections?.();
  server.close();
});
