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

const startMarkdownApp = (port) =>
  serverBased({
    title: 'quote making app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

test('GET /quote renders title and text as markdown', async () => {
  const port = 8301;
  const server = await startMarkdownApp(port);

  const response = await fetch(port).get('/quote', { params: { title: 'my title', text: 'my text' } });

  expect(response.status).toBe(200);
  expect(response.data).toBe('## my title\n> my text\n');

  await server.closeAsync();
});

test('GET /quote falls back to "not provided" when title or text is missing', async () => {
  const port = 8302;
  const server = await startMarkdownApp(port);

  const response = await fetch(port).get('/quote');

  expect(response.status).toBe(200);
  expect(response.data).toBe('## not provided\n> not provided\n');

  await server.closeAsync();
});
