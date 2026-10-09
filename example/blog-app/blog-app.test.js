/**
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const { expect } = require('@jest/globals');
const axios = require('axios/dist/node/axios.cjs');
const fetch = (port) =>
  axios.create({
    baseURL: `http://localhost:${port}`,
    validateStatus: () => true,
  });

const { serverBased } = require('../../lib/server-based');

const dataDir = path.join(__dirname, 'data');

// Posts/comments/likes now persist to JSON files on disk (see functions/plugins/*.plugin.js),
// not just in an in-memory Map per run() call — so, unlike before, state would otherwise leak
// across tests in this file (they all point at the same ../data/*.json files). Wipe the data
// dir before every test to keep each test's starting state identical to a fresh first run.
beforeEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const startBlogApp = (port) =>
  serverBased({
    title: 'blog app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
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

test('posts persist across a restart — a second run() picks up what the first one wrote', async () => {
  const portOne = 8208;
  const portTwo = 8209;
  const serverOne = await startBlogApp(portOne);

  await fetch(portOne).post('/posts', { title: 'second post', body: 'more blog', author: 'pavlo' });
  await serverOne.closeAsync();

  const serverTwo = await startBlogApp(portTwo);
  const fromServerTwo = await fetch(portTwo).get('/posts');

  expect(Object.keys(fromServerTwo.data.data)).toEqual(['1', '2']);

  await serverTwo.closeAsync();
});

test('POST /posts/:postId/comments creates a comment referencing its post, 404s for a missing post', async () => {
  const port = 8210;
  const server = await startBlogApp(port);

  const created = await fetch(port).post('/posts/1/comments', { body: 'nice post!', author: 'anon' });
  expect(created.status).toBe(201);
  expect(created.data).toEqual({
    message: 'comment created',
    data: { commentId: 'c1', postId: '1', body: 'nice post!', author: 'anon', createdAt: expect.any(String) },
  });

  const missingPost = await fetch(port).post('/posts/999/comments', { body: 'nope' });
  expect(missingPost.status).toBe(404);

  const listed = await fetch(port).get('/posts/1/comments');
  expect(listed.data.data).toEqual([expect.objectContaining({ commentId: 'c1', postId: '1' })]);

  await server.closeAsync();
});

test('comments persist across a restart', async () => {
  const portOne = 8211;
  const portTwo = 8212;
  const serverOne = await startBlogApp(portOne);

  await fetch(portOne).post('/posts/1/comments', { body: 'persisted comment', author: 'pavlo' });
  await serverOne.closeAsync();

  const serverTwo = await startBlogApp(portTwo);
  const listed = await fetch(portTwo).get('/posts/1/comments');

  expect(listed.data.data).toEqual([expect.objectContaining({ body: 'persisted comment' })]);

  await serverTwo.closeAsync();
});

test('POST /posts/:postId/likes likes a post; GET lists only post-level likes, not comment likes', async () => {
  const port = 8213;
  const server = await startBlogApp(port);

  const liked = await fetch(port).post('/posts/1/likes');
  expect(liked.status).toBe(201);
  expect(liked.data).toEqual({
    message: 'post liked',
    data: { likeId: 'l1', postId: '1', commentId: null, createdAt: expect.any(String) },
  });

  await fetch(port).post('/posts/1/comments', { body: 'a comment' });
  await fetch(port).post('/posts/1/comments/c1/likes');

  const listed = await fetch(port).get('/posts/1/likes');
  expect(listed.data.data).toEqual([expect.objectContaining({ likeId: 'l1', commentId: null })]);

  await server.closeAsync();
});

test('POST /posts/:postId/comments/:commentId/likes likes a comment, 404s for a missing comment', async () => {
  const port = 8214;
  const server = await startBlogApp(port);

  await fetch(port).post('/posts/1/comments', { body: 'a comment' });

  const liked = await fetch(port).post('/posts/1/comments/c1/likes');
  expect(liked.status).toBe(201);
  expect(liked.data.data).toMatchObject({ postId: '1', commentId: 'c1' });

  const missing = await fetch(port).post('/posts/1/comments/c999/likes');
  expect(missing.status).toBe(404);

  const listed = await fetch(port).get('/posts/1/comments/c1/likes');
  expect(listed.data.data).toEqual([expect.objectContaining({ commentId: 'c1' })]);

  await server.closeAsync();
});
