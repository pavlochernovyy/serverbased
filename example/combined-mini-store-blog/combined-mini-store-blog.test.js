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
const { handlers, middlewares, plugins } = require('./index');

const startCombinedApp = (port) =>
  serverBased({
    title: 'combined blog + mini-store',
    purpose: 'blog + mini-store http api',
    version: '1.0',
    middlewares,
    handlers,
    plugins,
    runningPort: port,
  }).run();

test('serves both blog-app and mini-store routes on the same server instance', async () => {
  const port = 8801;
  const server = await startCombinedApp(port);

  const posts = await fetch(port).get('/posts');
  expect(posts.status).toBe(200);
  expect(posts.data.data['1']).toMatchObject({ title: 'first post' });

  const cart = await fetch(port).get('/cart/cart-1');
  expect(cart.status).toBe(200);
  expect(cart.data).toEqual({ data: {} });

  await server.closeAsync();
});

test("mini-store's cart plugin state does not perturb blog-app's default-store state, or vice versa", async () => {
  const port = 8802;
  const server = await startCombinedApp(port);

  await fetch(port).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 1 });
  await fetch(port).post('/posts', { title: 'second post', body: 'more blog', author: 'pavlo' });

  const posts = await fetch(port).get('/posts');
  expect(Object.keys(posts.data.data)).toEqual(['1', '2']);

  const cart = await fetch(port).get('/cart/cart-1');
  expect(Object.keys(cart.data.data)).toEqual(['1']);

  await server.closeAsync();
});

test('mini-store checkout (sale plugin) still applies the bulk discount when composed with blog-app', async () => {
  const port = 8803;
  const server = await startCombinedApp(port);

  await fetch(port).post('/cart/cart-1/items', { id: 1, name: 'mug', price: 10, qty: 6 });

  const checkout = await fetch(port).get('/cart/cart-1/checkout');
  expect(checkout.data.data).toEqual({
    itemCount: 6,
    subtotal: 60,
    discount: 6,
    total: 54,
    bulkDiscountApplied: true,
  });

  await server.closeAsync();
});
