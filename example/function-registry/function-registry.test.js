/**
 * @jest-environment node
 */
const path = require('path');
const { expect } = require('@jest/globals');
const axios = require('axios/dist/node/axios.cjs');
const fetch = (port) =>
  axios.create({
    baseURL: `http://localhost:${port}`,
  });

const { serverBased } = require('../../lib/server-based');

test('mounts a function listed in serverbased.json under its configured route', async () => {
  const port = 8020;
  const server = await serverBased({
    title: 'function registry app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

  const response = await fetch(port).get('/greeter/hello/world');
  expect(response.status).toBe(200);
  expect(response.data).toEqual({ message: 'hello, world' });

  await server.closeAsync();
});

test('omitting configPath boots normally with no functions mounted', async () => {
  const port = 8021;
  const server = await serverBased({
    title: 'plain app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    runningPort: port,
  }).run();

  const response = await fetch(port)
    .get('/greeter/hello/world')
    .catch((error) => error.response);
  expect(response.status).toBe(404);

  await server.closeAsync();
});
