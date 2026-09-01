/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const axios = require('axios/dist/node/axios.cjs');
const fetch = (port) =>
  axios.create({
    baseURL: `http://localhost:${port}`,
    validateStatus: () => true,
  });

const { serverBased } = require('../../lib/server-based');
const { handlers, middlewares } = require('./index');

const startTodoApp = (port) =>
  serverBased({
    title: 'todo app',
    purpose: 'http api',
    version: '1.0',
    middlewares,
    handlers,
    runningPort: port,
  }).run();

// todos are held in server-based's per-app state (seeded on first access within each app instance, isolated
// across the servers started below), and the logging middleware tags every response body with `logs: 'submitted'`.

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
