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
    title: 'combined 3-apps (todo + blog + markdown)',
    purpose: 'todo + blog + markdown http api',
    version: '1.0',
    middlewares,
    handlers,
    runningPort: port,
  }).run();

test('serves todo-app, blog-app, and markdown-app routes on the same server instance', async () => {
  const port = 8601;
  const server = await startCombinedApp(port);

  const todos = await fetch(port).get('/todo');
  expect(todos.status).toBe(200);
  expect(todos.data.data).toEqual({ 1: { title: 't #1', description: 'd #1' } });

  const posts = await fetch(port).get('/posts');
  expect(posts.status).toBe(200);
  expect(posts.data.data['1']).toMatchObject({ title: 'first post' });

  const quote = await fetch(port).get('/quote?title=hello&text=world');
  expect(quote.status).toBe(200);
  expect(quote.data).toContain('hello');
  expect(quote.data).toContain('world');

  await server.closeAsync();
});

test("keeps each module's app-scoped state isolated by key, even with three modules sharing one stateStore", async () => {
  const port = 8602;
  const server = await startCombinedApp(port);

  await fetch(port).post('/todo', { id: 2, title: 't #2', description: 'd #2' });
  const todos = await fetch(port).get('/todo');
  expect(Object.keys(todos.data.data)).toEqual(['1', '2']);

  const posts = await fetch(port).get('/posts');
  expect(Object.keys(posts.data.data)).toEqual(['1']);

  await server.closeAsync();
});
