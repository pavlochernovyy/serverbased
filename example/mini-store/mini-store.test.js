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
const { handlers, plugins } = require('./index');

const startMiniStoreApp = (port) =>
  serverBased({
    title: 'mini-store app',
    purpose: 'http api',
    version: '1.0',
    handlers,
    plugins,
    runningPort: port,
  }).run();

test('GET /cart/:cartId on an untouched cart returns no items', async () => {
  const port = 8601;
  const server = await startMiniStoreApp(port);

  const response = await fetch(port).get('/cart/cart-1');

  expect(response.status).toBe(200);
  expect(response.data).toEqual({ data: {} });

  await server.closeAsync();
});

test('POST /cart/:cartId/items adds an item, then GET reflects it', async () => {
  const port = 8602;
  const server = await startMiniStoreApp(port);

  const posted = await fetch(port).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 2 });
  expect(posted.status).toBe(201);
  expect(posted.data.message).toBe('item added');
  expect(posted.data.data).toEqual({ 1: { id: 1, name: 'mug', price: 10, qty: 2 } });

  const found = await fetch(port).get('/cart/cart-1');
  expect(found.data.data).toEqual({ 1: { id: 1, name: 'mug', price: 10, qty: 2 } });

  await server.closeAsync();
});

test('DELETE /cart/:cartId/items/:itemId removes one item', async () => {
  const port = 8603;
  const server = await startMiniStoreApp(port);

  await fetch(port).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 1 });
  await fetch(port).post('/cart/cart-1/items', { id: 2, name: 'plate', price: 5, qty: 1 });

  const response = await fetch(port).delete('/cart/cart-1/items/1');
  expect(response.status).toBe(200);
  expect(response.data.data).toEqual({ 2: { id: 2, name: 'plate', price: 5, qty: 1 } });

  await server.closeAsync();
});

test('DELETE /cart/:cartId clears the whole cart', async () => {
  const port = 8604;
  const server = await startMiniStoreApp(port);

  await fetch(port).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 1 });

  const response = await fetch(port).delete('/cart/cart-1');
  expect(response.status).toBe(200);
  expect(response.data).toEqual({ message: 'cart cleared' });

  const found = await fetch(port).get('/cart/cart-1');
  expect(found.data).toEqual({ data: {} });

  await server.closeAsync();
});

test('keeps items isolated per cartId within the same server', async () => {
  const port = 8605;
  const server = await startMiniStoreApp(port);

  await fetch(port).post('/cart/cart-a/items', { id: 1, name: 'mug', price: 10, qty: 1 });
  await fetch(port).post('/cart/cart-b/items', { id: 2, name: 'plate', price: 5, qty: 1 });

  const cartA = await fetch(port).get('/cart/cart-a');
  const cartB = await fetch(port).get('/cart/cart-b');

  expect(Object.keys(cartA.data.data)).toEqual(['1']);
  expect(Object.keys(cartB.data.data)).toEqual(['2']);

  await server.closeAsync();
});

test('each run() gets its own CartPlugin instance — no state leaks across server instances', async () => {
  const portOne = 8606;
  const portTwo = 8607;
  const serverOne = await startMiniStoreApp(portOne);
  const serverTwo = await startMiniStoreApp(portTwo);

  await fetch(portOne).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 1 });

  const fromServerOne = await fetch(portOne).get('/cart/cart-1');
  const fromServerTwo = await fetch(portTwo).get('/cart/cart-1');

  expect(fromServerOne.data.data).toEqual({ 1: { id: 1, name: 'mug', price: 10, qty: 1 } });
  expect(fromServerTwo.data.data).toEqual({});

  await serverOne.closeAsync();
  await serverTwo.closeAsync();
});
