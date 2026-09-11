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

const { serverBased } = require('./server-based');
const { writeFunctionConfig } = require('./test-fixtures');

test('thrown RuntimeError in a context handler is sent as JSON with its statusCode', async () => {
  const configPath = writeFunctionConfig(`
    const { RuntimeError } = require('${__dirname}/server-based');
    module.exports = {
      handlers: [{
        route: '/posts/:postId',
        method: 'GET',
        handlerType: 'context',
        run() {
          throw new RuntimeError('post not found', 404);
        },
      }],
    };
  `);

  const port = 8101;
  const server = await serverBased({
    title: 'error-handling app',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).get('/posts/999');

  expect(response.status).toBe(404);
  expect(response.headers['content-type']).toMatch(/json/);
  expect(response.data).toEqual({ message: 'post not found', name: 'RuntimeError' });

  await server.closeAsync();
});

test('a plain Error thrown in a context handler defaults to a 500 JSON response', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [{
        route: '/boom',
        method: 'GET',
        handlerType: 'context',
        run() {
          throw new Error('unexpected failure');
        },
      }],
    };
  `);

  const port = 8102;
  const server = await serverBased({
    title: 'error-handling app',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).get('/boom');

  expect(response.status).toBe(500);
  expect(response.headers['content-type']).toMatch(/json/);
  expect(response.data).toEqual({ message: 'unexpected failure', name: 'Error' });

  await server.closeAsync();
});

test('a rejected async context handler is caught and sent as JSON', async () => {
  const configPath = writeFunctionConfig(`
    const { RuntimeError } = require('${__dirname}/server-based');
    module.exports = {
      handlers: [{
        route: '/async-boom',
        method: 'GET',
        handlerType: 'context',
        async run() {
          await Promise.resolve();
          throw new RuntimeError('bad input', 400);
        },
      }],
    };
  `);

  const port = 8103;
  const server = await serverBased({
    title: 'error-handling app',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).get('/async-boom');

  expect(response.status).toBe(400);
  expect(response.data).toEqual({ message: 'bad input', name: 'RuntimeError' });

  await server.closeAsync();
});

test('a malformed JSON request body is caught and sent as JSON instead of an HTML stack trace', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [{
        route: '/noop',
        method: 'POST',
        handlerType: 'context',
        run(context) {
          context.provideReply({ message: 'ok' }).send();
        },
      }],
    };
  `);

  const port = 8104;
  const server = await serverBased({
    title: 'error-handling app',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).post('/noop', 'not json', {
    headers: { 'Content-Type': 'application/json' },
  });

  expect(response.status).toBe(400);
  expect(response.headers['content-type']).toMatch(/json/);
  expect(response.data.name).toBe('SyntaxError');

  await server.closeAsync();
});

test('an origin-type handler throwing synchronously is still caught and sent as JSON', async () => {
  const configPath = writeFunctionConfig(`
    const { RuntimeError } = require('${__dirname}/server-based');
    module.exports = {
      handlers: [{
        route: '/origin-boom',
        method: 'GET',
        handlerType: 'origin',
        run() {
          throw new RuntimeError('origin failure', 422);
        },
      }],
    };
  `);

  const port = 8105;
  const server = await serverBased({
    title: 'error-handling app',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).get('/origin-boom');

  expect(response.status).toBe(422);
  expect(response.data).toEqual({ message: 'origin failure', name: 'RuntimeError' });

  await server.closeAsync();
});
