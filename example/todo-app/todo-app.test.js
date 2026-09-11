/**
 * @jest-environment node
 */
const path = require('path');
const { expect } = require('@jest/globals');
const axios = require('axios/dist/node/axios.cjs');
const fetch = (port) =>
  axios.create({
    baseURL: `http://localhost:${port}`,
    validateStatus: () => true,
  });

const { serverBased } = require('../../lib/server-based');

const startTodoApp = (port) =>
  serverBased({
    title: 'todo app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

// todos are seeded by TodoStorePlugin (functions/plugins/todo-store.plugin.js) — a fresh,
// pre-populated instance per run() call, isolated across the servers started below — and the
// logging middleware tags every response body with `logs: 'submitted'`.

test('GET /todo lists the seeded todo', async () => {
  const port = 8401;
  const server = await startTodoApp(port);

  const response = await fetch(port).get('/todo');

  expect(response.status).toBe(200);
  expect(response.data).toEqual({
    data: { 1: { title: 't #1', description: 'd #1' } },
    logs: 'submitted',
  });

  await server.closeAsync();
});

test('GET /todo/:todoId returns the todo, or an empty object when missing', async () => {
  const port = 8402;
  const server = await startTodoApp(port);

  const found = await fetch(port).get('/todo/1');
  expect(found.status).toBe(200);
  expect(found.data).toEqual({ data: { title: 't #1', description: 'd #1' }, logs: 'submitted' });

  const missing = await fetch(port).get('/todo/999');
  expect(missing.status).toBe(200);
  expect(missing.data).toEqual({ data: {}, logs: 'submitted' });

  await server.closeAsync();
});

test('POST /todo creates a todo', async () => {
  const port = 8403;
  const server = await startTodoApp(port);

  const response = await fetch(port).post('/todo', { id: 2, title: 't #2', description: 'd #2' });

  expect(response.status).toBe(201);
  expect(response.data).toEqual({ message: 'todo created', logs: 'submitted' });

  const found = await fetch(port).get('/todo/2');
  expect(found.data.data).toEqual({ title: 't #2', description: 'd #2' });

  await server.closeAsync();
});

test('PUT /todo updates a todo', async () => {
  const port = 8404;
  const server = await startTodoApp(port);

  const response = await fetch(port).put('/todo', { id: 1, title: 't #1 updated', description: 'd #1 updated' });

  expect(response.status).toBe(200);
  expect(response.data).toEqual({ message: 'success', logs: 'submitted' });

  const found = await fetch(port).get('/todo/1');
  expect(found.data.data).toEqual({ title: 't #1 updated', description: 'd #1 updated' });

  await server.closeAsync();
});

test('DELETE /todo/:todoId removes a todo', async () => {
  const port = 8405;
  const server = await startTodoApp(port);

  const response = await fetch(port).delete('/todo/1');

  expect(response.status).toBe(200);
  expect(response.data.message).toBe('success');
  expect(response.data.data).not.toHaveProperty('1');
  expect(response.data.logs).toBe('submitted');

  await server.closeAsync();
});

test('each run() gets its own seeded TodoStorePlugin instance — no state leaks across server instances', async () => {
  const portOne = 8406;
  const portTwo = 8407;
  const serverOne = await startTodoApp(portOne);
  const serverTwo = await startTodoApp(portTwo);

  await fetch(portOne).post('/todo', { id: 2, title: 't #2', description: 'd #2' });

  const fromServerOne = await fetch(portOne).get('/todo');
  const fromServerTwo = await fetch(portTwo).get('/todo');

  expect(Object.keys(fromServerOne.data.data)).toEqual(['1', '2']);
  expect(Object.keys(fromServerTwo.data.data)).toEqual(['1']);

  await serverOne.closeAsync();
  await serverTwo.closeAsync();
});
