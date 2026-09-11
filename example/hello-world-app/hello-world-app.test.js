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
    title: 'hello world app',
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

test("a function's own named plugin is reachable via context, in-process (not HTTP)", async () => {
  const port = 8026;
  const server = await serverBased({
    title: 'hello world app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

  const created = await fetch(port).post('/cart/items', { id: 'i1', name: 'widget' });
  expect(created.status).toBe(201);
  expect(created.data).toEqual({ data: { i1: { id: 'i1', name: 'widget' } } });

  const items = await fetch(port).get('/cart/items');
  expect(items.data).toEqual({ data: { i1: { id: 'i1', name: 'widget' } } });

  await server.closeAsync();
});

test("a function's own plugin instance is fresh per run() call — no state leaks across app instances", async () => {
  const portA = 8027;
  const serverA = await serverBased({
    title: 'hello world app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: portA,
  }).run();

  await fetch(portA).post('/cart/items', { id: 'i1', name: 'widget' });

  const portB = 8028;
  const serverB = await serverBased({
    title: 'hello world app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: portB,
  }).run();

  const itemsOnB = await fetch(portB).get('/cart/items');
  expect(itemsOnB.data).toEqual({ data: {} });

  await serverA.closeAsync();
  await serverB.closeAsync();
});

test('throws a ServerBasedError when configPath is omitted', () => {
  expect(() =>
    serverBased({
      title: 'plain app',
      purpose: 'http api',
      version: '1.0',
      runningPort: 8021,
    })
  ).toThrow('configPath parameter is required');
});

test('reaches both cart and greeter functions on the same running serverbased instance', async () => {
  const port = 8029;
  const server = await serverBased({
    title: 'hello world app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

  const greeted = await fetch(port).get('/greeter/hello/world');
  expect(greeted.status).toBe(200);
  expect(greeted.data).toEqual({ message: 'hello, world' });

  const created = await fetch(port).post('/cart/items', { id: 'i1', name: 'widget' });
  expect(created.status).toBe(201);
  expect(created.data).toEqual({ data: { i1: { id: 'i1', name: 'widget' } } });

  await server.closeAsync();
});
