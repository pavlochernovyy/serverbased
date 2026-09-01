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

const startBlogApp = (port) =>
  serverBased({
    title: 'blog app',
    purpose: 'http api',
    version: '1.0',
    middlewares,
    handlers,
    runningPort: port,
  }).run();

test('GET /posts lists the seeded post', async () => {
  const port = 8201;
  const server = await startBlogApp(port);

  const response = await fetch(port).get('/posts');

  expect(response.status).toBe(200);
  expect(response.data.data['1']).toMatchObject({ title: 'first post', body: 'hello, blog', author: 'pavlo' });

  await server.closeAsync();
});

test('GET /posts/:postId returns the post and increments its view count on each request', async () => {
  const port = 8202;
  const server = await startBlogApp(port);

  const response1 = await fetch(port).get('/posts/1');
  expect(response1.status).toBe(200);
  expect(response1.data.data).toMatchObject({ title: 'first post', views: 1 });

  const response2 = await fetch(port).get('/posts/1');
  expect(response2.status).toBe(200);
  expect(response2.data.data).toMatchObject({ title: 'first post', views: 2 });

  await server.closeAsync();
});

test('GET /posts/:postId responds 404 for a missing post', async () => {
  const port = 8203;
  const server = await startBlogApp(port);

  const response = await fetch(port).get('/posts/999');

  expect(response.status).toBe(404);
  expect(response.data).toEqual({ message: 'post not found' });

  await server.closeAsync();
});

test('POST /posts creates a post and 400s when title or body is missing', async () => {
  const port = 8204;
  const server = await startBlogApp(port);

  const created = await fetch(port).post('/posts', { title: 'second post', body: 'more blog', author: 'pavlo' });
  expect(created.status).toBe(201);
  expect(created.data).toEqual({
    message: 'post created',
    data: { postId: '2', title: 'second post', body: 'more blog', author: 'pavlo', createdAt: expect.any(String) },
  });

  const invalid = await fetch(port).post('/posts', { title: 'missing body' });
  expect(invalid.status).toBe(400);
  expect(invalid.data).toEqual({ message: 'title and body are required' });

  await server.closeAsync();
});

test('PUT /posts/:postId partially updates a post and 404s when missing', async () => {
  const port = 8205;
  const server = await startBlogApp(port);

  const updated = await fetch(port).put('/posts/1', { title: 'first post, edited' });
  expect(updated.status).toBe(200);
  expect(updated.data.data).toMatchObject({ title: 'first post, edited', body: 'hello, blog', author: 'pavlo' });

  const missing = await fetch(port).put('/posts/999', { title: 'nope' });
  expect(missing.status).toBe(404);
  expect(missing.data).toEqual({ message: 'post not found' });

  await server.closeAsync();
});

test('DELETE /posts/:postId removes a post and 404s when missing', async () => {
  const port = 8206;
  const server = await startBlogApp(port);

  const deleted = await fetch(port).delete('/posts/1');
  expect(deleted.status).toBe(200);
  expect(deleted.data).toEqual({ message: 'post deleted', data: {} });

  const missing = await fetch(port).delete('/posts/1');
  expect(missing.status).toBe(404);
  expect(missing.data).toEqual({ message: 'post not found' });

  await server.closeAsync();
});

test('a malformed JSON request body is caught and sent as JSON instead of an HTML stack trace', async () => {
  const port = 8207;
  const server = await startBlogApp(port);

  const response = await fetch(port).post('/posts', 'not json', {
    headers: { 'Content-Type': 'application/json' },
  });

  expect(response.status).toBe(400);
  expect(response.headers['content-type']).toMatch(/json/);
  expect(response.data.name).toBe('SyntaxError');

  await server.closeAsync();
});
