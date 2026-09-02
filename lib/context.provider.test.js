/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const { serverBased } = require('./server-based');
const { ContextProvider } = require('./context.provider');

test('injectContext of ContextProvider is bound to run handler', async () => {
  const handlerGetAllTodos = {
    route: '/todo',
    method: 'GET',
    handlerType: 'context',
    run(context) {
      expect(context.fetchParamsInt).to.be.a('function');
      expect(context.fetchRequest).to.be.a('function');
      expect(context.provideReply).to.be.a('function');

      const builder = context.provideReply({
        data: null,
      });

      expect(builder.send).to.be.a('function');
      expect(builder.sendWithCode).to.be.a('function');
    },
  };

  const server = await serverBased({
    title: 'todo app',
    purpose: 'http api',
    version: '1.0',
    handlers: [handlerGetAllTodos],
  }).run();

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
