/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const axios = require('axios/dist/node/axios.cjs');
const fetch = (port) =>
  axios.create({
    baseURL: `http://localhost:${port}`,
  });

const { serverBased } = require('./server-based');
const { ContextProvider } = require('./context.provider');
const { writeFunctionConfig } = require('./test-fixtures');

test('injectContext of ContextProvider is bound to run handler', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [{
        route: '/todo',
        method: 'GET',
        handlerType: 'context',
        run(context) {
          if (typeof context.fetchParamsInt !== 'function') throw new Error('fetchParamsInt not bound');
          if (typeof context.fetchRequest !== 'function') throw new Error('fetchRequest not bound');
          if (typeof context.provideReply !== 'function') throw new Error('provideReply not bound');

          const builder = context.provideReply({ data: null });

          if (typeof builder.send !== 'function') throw new Error('send not bound');
          if (typeof builder.sendWithCode !== 'function') throw new Error('sendWithCode not bound');

          builder.send();
        },
      }],
    };
  `);

  const port = 8201;
  const server = await serverBased({
    title: 'todo app',
    purpose: 'http api',
    version: '1.0',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).get('/todo');
  expect(response.status).toBe(200);

  await server.closeAsync();
});

test('attaches each plugin instance onto the context under its name', () => {
  const cartPlugin = { addItem: (item) => item };
  const context = new ContextProvider({}, {}, [{ name: 'cart', instance: cartPlugin }]);

  expect(context.cart).toBe(cartPlugin);
});

test('provideState/conductState delegate to the injected "store" plugin instance', () => {
  const store = new Map();
  const context = new ContextProvider({}, {}, [{ name: 'store', instance: store }]);

  context.provideState('hits', 1);

  expect(store.get('hits')).toBe(1);
  expect(context.conductState('hits')).toBe(1);
});
