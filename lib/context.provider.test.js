/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const { serverBased } = require('./server-based');

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
