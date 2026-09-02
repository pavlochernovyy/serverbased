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

const startCombinedApp = (port) =>
  serverBased({
    title: 'combined 2-apps (todo + blog)',
    purpose: 'todo + blog http api',
    version: '1.0',
    middlewares,
    handlers,
    runningPort: port,
  }).run();

test('serves both todo-app and blog-app routes on the same server instance', async () => {
  const port = 8501;
  const server = await startCombinedApp(port);

  const todos = await fetch(port).get('/todo');
  expect(todos.status).toBe(200);
  expect(todos.data.data).toEqual({ 1: { title: 't #1', description: 'd #1' } });

  const posts = await fetch(port).get('/posts');
  expect(posts.status).toBe(200);
  expect(posts.data.data['1']).toMatchObject({ title: 'first post' });

  await server.closeAsync();
});

test("keeps each module's app-scoped state isolated by key, even though both share one stateStore", async () => {
  const port = 8502;
  const server = await startCombinedApp(port);

  await fetch(port).post('/todo', { id: 2, title: 't #2', description: 'd #2' });
  const todos = await fetch(port).get('/todo');
  expect(Object.keys(todos.data.data)).toEqual(['1', '2']);

  // creating a todo must not perturb blog-app's separately-keyed state
  const posts = await fetch(port).get('/posts');
  expect(Object.keys(posts.data.data)).toEqual(['1']);

  await server.closeAsync();
});
