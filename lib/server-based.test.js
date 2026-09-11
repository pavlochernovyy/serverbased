/**
 * @jest-environment node
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('@jest/globals');
const axios = require('axios/dist/node/axios.cjs');
const fetch = (port) =>
  axios.create({
    baseURL: `http://localhost:${port}`,
  });

const { serverBased, defaults } = require('./server-based');
const { writeFunctionConfig } = require('./test-fixtures');

test('server-based creates own entity successfully', () => {
  const configPath = writeFunctionConfig(`module.exports = { handlers: [] };`);
  const payload = {
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    networkProtocol: 'http',
    configPath,
  };

  const server = serverBased(payload);
  const { title, purpose, version, run, endpointType, runningPort = 8000, networkProtocol } = server;

  expect(title).toBe(payload.title);
  expect(purpose).toBe(payload.purpose);
  expect(version).toBe(payload.version);
  expect(runningPort).toBe(defaults.runningPort);
  expect(networkProtocol).toBe(defaults.networkProtocol.http);
  expect(endpointType).toBe(defaults.endpointType.server);
  expect(typeof run).toBe('function');
});

test('throws a ServerBasedError when title, purpose, version, or configPath is missing', () => {
  const configPath = writeFunctionConfig(`module.exports = { handlers: [] };`);
  const base = { title: 'e-commerce', purpose: 'api', version: 'v0.0.1', configPath };

  expect(() => serverBased({ ...base, title: undefined })).toThrow('title parameter is required');
  expect(() => serverBased({ ...base, purpose: undefined })).toThrow('purpose parameter is required');
  expect(() => serverBased({ ...base, version: undefined })).toThrow('version parameter is required');
  expect(() => serverBased({ ...base, configPath: undefined })).toThrow('configPath parameter is required');
});

test('server-based runs common middlewares for each handler successfully', async () => {
  const configPath = writeFunctionConfig(`
    const handlerAuditLogs = {
      route: '/audit-logs',
      method: 'GET',
      handlerType: 'context',
      run(context) {
        const { saleProposal, discountCoupon } = context.fetchRequest().body;
        context.provideReply({ message: 'audit logs run', saleProposal, discountCoupon }).send();
      },
    };

    const handlerItemsCart = {
      route: '/items-cart',
      method: 'GET',
      handlerType: 'context',
      run(context) {
        const { saleProposal, discountCoupon } = context.fetchRequest().body;
        context.provideReply({ message: 'items cart run', saleProposal, discountCoupon }).send();
      },
    };

    const saleProposalMiddleware = (req, res, next) => {
      req.body.saleProposal = '10% off for 2 items in cart';
      next();
    };

    const discountCouponMiddleware = (req, res, next) => {
      req.body.discountCoupon = 'abc1000';
      next();
    };

    module.exports = {
      handlers: [handlerAuditLogs, handlerItemsCart],
      middlewares: [saleProposalMiddleware, discountCouponMiddleware],
    };
  `);

  const port = 8001;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response1 = await fetch(port).get('/audit-logs');
  const received1 = JSON.stringify(response1.data);
  const expected1 = JSON.stringify({
    message: 'audit logs run',
    saleProposal: '10% off for 2 items in cart',
    discountCoupon: 'abc1000',
  });

  expect(response1.status).toBe(200);
  expect(received1).toBe(expected1);

  const response2 = await fetch(port).get('/items-cart');
  const received2 = JSON.stringify(response2.data);
  const expected2 = JSON.stringify({
    message: 'items cart run',
    saleProposal: '10% off for 2 items in cart',
    discountCoupon: 'abc1000',
  });

  expect(response2.status).toBe(200);
  expect(received2).toBe(expected2);

  await server.closeAsync();
});

test('server-based registers handler and run the http server for', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [{
        route: '/audit-logs',
        method: 'GET',
        handlerType: 'context',
        run(context) {
          context.provideReply({ message: 'audit logs run' }).send();
        },
      }],
    };
  `);

  const port = 8002;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).get('/audit-logs');
  expect(response.status).toBe(200);
  expect(JSON.stringify(response.data)).toBe(JSON.stringify({ message: 'audit logs run' }));

  await server.closeAsync();
});

test(`server-based responds with json data for handler's body per request`, async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [{
        route: '/body-message-handler',
        method: 'POST',
        handlerType: 'context',
        run(context) {
          const { message } = context.fetchRequest().body;
          context.provideReply({ message: \`\${message} received\` }).sendWithCode(201);
        },
      }],
    };
  `);

  const port = 8003;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).post('/body-message-handler', { message: 'body message' });
  expect(response.status).toBe(201);
  expect(JSON.stringify(response.data)).toBe(JSON.stringify({ message: 'body message received' }));

  await server.closeAsync();
});

test('server-based runs few handlers with different payload', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [
        {
          route: '/query-message',
          method: 'GET',
          handlerType: 'context',
          run(context) {
            const { message } = context.fetchRequest().query;
            context.provideReply({ message: \`\${message} received\` }).send();
          },
        },
        {
          route: '/body-message',
          method: 'POST',
          handlerType: 'context',
          run(context) {
            const { message } = context.fetchRequest().body;
            context.provideReply({ message: \`\${message} received\` }).sendWithCode(201);
          },
        },
      ],
    };
  `);

  const port = 8004;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response1 = await fetch(port).get('/query-message', { params: { message: 'query message' } });
  const received1 = JSON.stringify(response1.data);
  const expected1 = JSON.stringify({ message: 'query message received' });

  expect(response1.status).toBe(200);
  expect(received1).toBe(expected1);

  const response2 = await fetch(port).post('/body-message', { message: 'body message' });
  const received2 = JSON.stringify(response2.data);
  const expected2 = JSON.stringify({ message: 'body message received' });

  expect(response2.status).toBe(201);
  expect(received2).toBe(expected2);

  await server.closeAsync();
});

test('server-based invokes middleware for handler provided', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [{
        route: '/query-message',
        method: 'GET',
        middleware: {
          run(req, res, next) {
            req.query.middlewareMessage = 'middleware message';
            next();
          },
        },
        handlerType: 'context',
        run(context) {
          const { message, middlewareMessage } = context.fetchRequest().query;
          context
            .provideReply({
              message: \`\${message} received\`,
              middlewareMessage: \`\${middlewareMessage} received\`,
            })
            .send();
        },
      }],
    };
  `);

  const port = 8005;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).get('/query-message', { params: { message: 'query message' } });
  const received = JSON.stringify(response.data);
  const expected = JSON.stringify({
    message: 'query message received',
    middlewareMessage: 'middleware message received',
  });

  expect(response.status).toBe(200);
  expect(received).toBe(expected);

  await server.closeAsync();
});

test('server-based operates with route parameters successfully', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [{
        route: '/params-message/:messageId',
        method: 'GET',
        handlerType: 'context',
        run(context) {
          const { messageId } = context.fetchRequest().params;
          context.provideReply({ message: \`\${messageId} received\` }).send();
        },
      }],
    };
  `);

  const port = 8006;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const messageId = 'test-id-parameter';

  const response = await fetch(port).get(`params-message/${messageId}`);
  const received = JSON.stringify(response.data);
  const expected = JSON.stringify({
    message: `${messageId} received`,
  });

  expect(response.status).toBe(200);
  expect(received).toBe(expected);

  await server.closeAsync();
});

test('server-based can register handlers with context or origin type', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [
        {
          route: '/context-message',
          method: 'PUT',
          handlerType: 'context',
          run(context) {
            const { message } = context.fetchRequest().body;
            context.provideReply({ message: \`context \${message} received\` }).send();
          },
        },
        {
          route: '/origin-message',
          method: 'PUT',
          handlerType: 'origin',
          run(req, res) {
            const { message } = req.body;
            res.send({ message: \`origin \${message} received\` });
          },
        },
      ],
    };
  `);

  const port = 8007;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const message1 = 'context put message';
  const response1 = await fetch(port).put('/context-message', { message: message1 });
  const received1 = JSON.stringify(response1.data);
  const expected1 = JSON.stringify({
    message: `context ${message1} received`,
  });

  expect(response1.status).toBe(200);
  expect(received1).toBe(expected1);

  const message2 = 'origin put message';
  const response2 = await fetch(port).put('/origin-message', { message: message2 });
  const received2 = JSON.stringify(response2.data);
  const expected2 = JSON.stringify({
    message: `origin ${message2} received`,
  });

  expect(response2.status).toBe(200);
  expect(received2).toBe(expected2);

  await server.closeAsync();
});

test('server-based shares provideState/conductState across requests and handlers within the same app instance', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [
        {
          route: '/hits',
          method: 'POST',
          handlerType: 'context',
          run(context) {
            const hits = (context.conductState('hits') || 0) + 1;
            context.provideState('hits', hits);
            context.provideReply({ hits }).send();
          },
        },
        {
          route: '/hits',
          method: 'GET',
          handlerType: 'context',
          run(context) {
            context.provideReply({ hits: context.conductState('hits') ?? 0 }).send();
          },
        },
      ],
    };
  `);

  const port = 8008;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  expect((await fetch(port).get('/hits')).data).toEqual({ hits: 0 });

  expect((await fetch(port).post('/hits')).data).toEqual({ hits: 1 });
  expect((await fetch(port).post('/hits')).data).toEqual({ hits: 2 });

  expect((await fetch(port).get('/hits')).data).toEqual({ hits: 2 });

  await server.closeAsync();
});

test('attaches a custom plugin onto the context, reachable inside a handler over HTTP', async () => {
  const configPath = writeFunctionConfig(`
    class GreeterPlugin {
      greet(name) {
        return \`hello, \${name}\`;
      }
    }

    module.exports = {
      handlers: [{
        route: '/greet/:name',
        method: 'GET',
        handlerType: 'context',
        run(context) {
          const { name } = context.fetchRequest().params;
          context.provideReply({ message: context.greeter.greet(name) }).send();
        },
      }],
      plugins: [{ name: 'greeter', plugin: GreeterPlugin }],
    };
  `);

  const port = 8009;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).get('/greet/world');
  expect(response.status).toBe(200);
  expect(response.data).toEqual({ message: 'hello, world' });

  await server.closeAsync();
});

test('auto-injects the default "store" plugin when no plugins are supplied', async () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [
        {
          route: '/hits',
          method: 'GET',
          handlerType: 'context',
          run(context) {
            context.provideReply({ hits: context.conductState('hits') ?? 0 }).send();
          },
        },
        {
          route: '/hits',
          method: 'POST',
          handlerType: 'context',
          run(context) {
            const hits = (context.conductState('hits') ?? 0) + 1;
            context.provideState('hits', hits);
            context.provideReply({ hits }).send();
          },
        },
        {
          route: '/hits',
          method: 'DELETE',
          handlerType: 'context',
          run(context) {
            const hits = (context.conductState('hits') ?? 0) - 1;
            context.provideState('hits', hits);
            context.provideReply({ hits }).send();
          },
        },
      ],
    };
  `);

  const port = 8010;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  expect((await fetch(port).get('/hits')).data).toEqual({ hits: 0 });

  expect((await fetch(port).post('/hits')).data).toEqual({ hits: 1 });
  expect((await fetch(port).post('/hits')).data).toEqual({ hits: 2 });
  expect((await fetch(port).get('/hits')).data).toEqual({ hits: 2 });

  expect((await fetch(port).delete('/hits')).data).toEqual({ hits: 1 });
  expect((await fetch(port).get('/hits')).data).toEqual({ hits: 1 });

  await server.closeAsync();
});

test('a caller-supplied "store" plugin overrides the default one', async () => {
  const configPath = writeFunctionConfig(`
    class UppercasingStore {
      constructor() {
        this._entries = new Map();
      }
      set(key, value) {
        this._entries.set(key, typeof value === 'string' ? value.toUpperCase() : value);
      }
      get(key) {
        return this._entries.get(key);
      }
    }

    module.exports = {
      handlers: [{
        route: '/echo',
        method: 'POST',
        handlerType: 'context',
        run(context) {
          const { message } = context.fetchRequest().body;
          context.provideState('message', message);
          context.provideReply({ message: context.conductState('message') }).send();
        },
      }],
      plugins: [{ name: 'store', plugin: UppercasingStore }],
    };
  `);

  const port = 8011;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    configPath,
    runningPort: port,
  }).run();

  const response = await fetch(port).post('/echo', { message: 'hi' });
  expect(response.data).toEqual({ message: 'HI' });

  await server.closeAsync();
});

test('throws when two handlers within the same function register the same method+route', () => {
  const configPath = writeFunctionConfig(`
    module.exports = {
      handlers: [
        {
          route: '/shared',
          method: 'GET',
          handlerType: 'context',
          run(context) {
            context.provideReply({ from: 'a' }).send();
          },
        },
        {
          route: '/shared',
          method: 'GET',
          handlerType: 'context',
          run(context) {
            context.provideReply({ from: 'b' }).send();
          },
        },
      ],
    };
  `);

  expect(() =>
    serverBased({
      title: 'e-commerce',
      purpose: 'api',
      version: 'v0.0.1',
      configPath,
      runningPort: 8013,
    }).run()
  ).toThrow('duplicate route registered: get /shared');
});

test('throws when two plugins within the same function register the same name', () => {
  const configPath = writeFunctionConfig(`
    class PluginA {}
    class PluginB {}

    module.exports = {
      handlers: [],
      plugins: [
        { name: 'shared', plugin: PluginA },
        { name: 'shared', plugin: PluginB },
      ],
    };
  `);

  expect(() =>
    serverBased({
      title: 'e-commerce',
      purpose: 'api',
      version: 'v0.0.1',
      configPath,
      runningPort: 8012,
    }).run()
  ).toThrow('duplicate plugin name registered: "shared"');
});

test('surfaces the loader error when two functions register the same route', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-based-'));
  fs.writeFileSync(path.join(dir, 'a.js'), `module.exports = { handlers: [] };`);
  fs.writeFileSync(path.join(dir, 'b.js'), `module.exports = { handlers: [] };`);
  const configPath = path.join(dir, 'serverbased.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      functions: {
        a: { path: './a.js', route: '/shared' },
        b: { path: './b.js', route: '/shared' },
      },
    })
  );

  expect(() =>
    serverBased({
      title: 'e-commerce',
      purpose: 'api',
      version: 'v0.0.1',
      configPath,
      runningPort: 8014,
    }).run()
  ).toThrow(`duplicate function route registered: "/shared"`);
});
