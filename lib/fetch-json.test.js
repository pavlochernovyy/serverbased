/**
 * @jest-environment node
 */
const http = require('http');
const { expect } = require('@jest/globals');
const { fetchJson } = require('./fetch-json');

test('resolves with the parsed JSON body of a GET request', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: { hello: 'world' } }));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const body = await fetchJson(`http://localhost:${port}/anything`);
  expect(body).toEqual({ data: { hello: 'world' } });

  await new Promise((resolve) => server.close(resolve));
});

test('rejects when the response body is not valid JSON', async () => {
  const server = http.createServer((req, res) => {
    res.end('not json');
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  await expect(fetchJson(`http://localhost:${port}/anything`)).rejects.toThrow();

  await new Promise((resolve) => server.close(resolve));
});

test('rejects on a connection error (nothing listening on the port)', async () => {
  await expect(fetchJson('http://localhost:1/unreachable')).rejects.toThrow();
});

test('is exported from lib/server-based.js for function authors to use', () => {
  const { fetchJson: exported } = require('./server-based');
  expect(exported).toBe(fetchJson);
});
