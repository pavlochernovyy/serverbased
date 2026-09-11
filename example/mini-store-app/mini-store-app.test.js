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

const startMiniStoreApp = (port) =>
  serverBased({
    title: 'mini-store app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

test('GET /cart/:cartId on an untouched cart returns no items', async () => {
  const port = 8701;
  const server = await startMiniStoreApp(port);

  const response = await fetch(port).get('/cart/cart-1');

  expect(response.status).toBe(200);
  expect(response.data).toEqual({ data: {} });

  await server.closeAsync();
});

test('POST /cart/:cartId/items adds an item, then GET reflects it', async () => {
  const port = 8702;
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
  const port = 8703;
  const server = await startMiniStoreApp(port);

  await fetch(port).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 1 });
  await fetch(port).post('/cart/cart-1/items', { id: 2, name: 'plate', price: 5, qty: 1 });

  const response = await fetch(port).delete('/cart/cart-1/items/1');
  expect(response.status).toBe(200);
  expect(response.data.data).toEqual({ 2: { id: 2, name: 'plate', price: 5, qty: 1 } });

  await server.closeAsync();
});

test('DELETE /cart/:cartId clears the whole cart', async () => {
  const port = 8704;
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
  const port = 8705;
  const server = await startMiniStoreApp(port);

  await fetch(port).post('/cart/cart-a/items', { id: 1, name: 'mug', price: 10, qty: 1 });
  await fetch(port).post('/cart/cart-b/items', { id: 2, name: 'plate', price: 5, qty: 1 });

  const cartA = await fetch(port).get('/cart/cart-a');
  const cartB = await fetch(port).get('/cart/cart-b');

  expect(Object.keys(cartA.data.data)).toEqual(['1']);
  expect(Object.keys(cartB.data.data)).toEqual(['2']);

  await server.closeAsync();
});

test("each run() gets its own cart function's plugin instance — no state leaks across server instances", async () => {
  const portOne = 8706;
  const portTwo = 8707;
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

test('GET /sale/:cartId/checkout on an empty cart has no discount', async () => {
  const port = 8708;
  const server = await startMiniStoreApp(port);

  const response = await fetch(port).get('/sale/cart-1/checkout');

  expect(response.status).toBe(200);
  expect(response.data.data).toEqual({
    itemCount: 0,
    subtotal: 0,
    discount: 0,
    total: 0,
    bulkDiscountApplied: false,
  });

  await server.closeAsync();
});

test('GET /sale/:cartId/checkout applies no discount for 5 items or fewer', async () => {
  const port = 8709;
  const server = await startMiniStoreApp(port);

  await fetch(port).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 5 });

  const response = await fetch(port).get('/sale/cart-1/checkout');

  expect(response.data.data).toEqual({
    itemCount: 5,
    subtotal: 50,
    discount: 0,
    total: 50,
    bulkDiscountApplied: false,
  });

  await server.closeAsync();
});

test('GET /sale/:cartId/checkout applies a bulk discount for more than 5 items', async () => {
  const port = 8710;
  const server = await startMiniStoreApp(port);

  await fetch(port).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 3 });
  await fetch(port).post('/cart/cart-1/items', { id: 2, name: 'plate', price: 5, qty: 3 });

  const response = await fetch(port).get('/sale/cart-1/checkout');

  expect(response.data.data).toEqual({
    itemCount: 6,
    subtotal: 45,
    discount: 4.5,
    total: 40.5,
    bulkDiscountApplied: true,
  });

  await server.closeAsync();
});

test("/sale/:cartId/checkout reads /cart's data over HTTP, across the plugin isolation boundary", async () => {
  const port = 8711;
  const server = await startMiniStoreApp(port);

  await fetch(port).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 2 });

  const checkout = await fetch(port).get('/sale/cart-1/checkout');
  expect(checkout.status).toBe(200);
  expect(checkout.data.data.subtotal).toBe(20);

  await server.closeAsync();
});
