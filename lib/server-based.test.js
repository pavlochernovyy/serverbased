/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const axios = require('axios/dist/node/axios.cjs');
const fetch = (port) =>
  axios.create({
    baseURL: `http://localhost:${port}`,
  });

const { serverBased, defaults } = require('./server-based');

test('server-based creates own entity successfully', () => {
  const payload = {
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    networkProtocol: 'http',
  };

  const server = serverBased(payload);
  const {
    title,
    purpose,
    version,
    handlers,
    run,
    endpointType,
    routerEngine,
    runningPort = 8000,
    runningMode,
    networkProtocol,
  } = server;

  expect(title).toBe(payload.title);
  expect(purpose).toBe(payload.purpose);
  expect(version).toBe(payload.version);
  expect(runningPort).toBe(defaults.runningPort);
  expect(runningMode).toBe(defaults.runningMode.server);
  expect(networkProtocol).toBe(defaults.networkProtocol.http);
  expect(routerEngine).toBe(defaults.routerEngine.express);
  expect(endpointType).toBe(defaults.endpointType.server);
  expect(JSON.stringify(handlers)).toBe(JSON.stringify({}));
  expect(typeof run).toBe('function');
});

test('server-based runs common middlewares for each handler successfully', async () => {
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

  const port = 8001;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    handlers: [handlerAuditLogs, handlerItemsCart],
    middlewares: [saleProposalMiddleware, discountCouponMiddleware],
    runningPort: port,
  }).run();

  const response1 = await fetch(port).get(handlerAuditLogs.route);
  const received1 = JSON.stringify(response1.data);
  const expected1 = JSON.stringify({
    message: 'audit logs run',
    saleProposal: '10% off for 2 items in cart',
    discountCoupon: 'abc1000',
  });

  expect(response1.status).toBe(200);
  expect(received1).toBe(expected1);

  const response2 = await fetch(port).get(handlerItemsCart.route);
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
  const handlerAuditLogs = {
    route: '/audit-logs',
    method: 'GET',
    handlerType: 'context',
    run(context) {
      context.provideReply({ message: 'audit logs run' }).send();
    },
  };

  const port = 8002;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    handlers: [handlerAuditLogs],
    runningPort: port,
  }).run();

  const response = await fetch(port).get(handlerAuditLogs.route);
  expect(response.status).toBe(200);
  expect(JSON.stringify(response.data)).toBe(JSON.stringify({ message: 'audit logs run' }));

  await server.closeAsync();
});

test(`server-based responds with json data for handler's body per request`, async () => {
  const handlerBodyReceiver = {
    route: '/body-message-handler',
    method: 'POST',
    handlerType: 'context',
    run(context) {
      const { message } = context.fetchRequest().body;
      context.provideReply({ message: `${message} received` }).sendWithCode(201);
    },
  };

  const port = 8003;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    handlers: [handlerBodyReceiver],
    runningPort: port,
  }).run();

  const response = await fetch(port).post(handlerBodyReceiver.route, { message: 'body message' });
  expect(response.status).toBe(201);
  expect(JSON.stringify(response.data)).toBe(JSON.stringify({ message: 'body message received' }));

  await server.closeAsync();
});

test('server-based runs few handlers with different payload', async () => {
  const handlerQueryReceiver = {
    route: '/query-message',
    method: 'GET',
    handlerType: 'context',
    run(context) {
      const { message } = context.fetchRequest().query;
      context.provideReply({ message: `${message} received` }).send();
    },
  };

  const handlerBodyReceiver = {
    route: '/body-message',
    method: 'POST',
    handlerType: 'context',
    run(context) {
      const { message } = context.fetchRequest().body;
      context.provideReply({ message: `${message} received` }).sendWithCode(201);
    },
  };

  const port = 8004;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    handlers: [handlerQueryReceiver, handlerBodyReceiver],
    runningPort: port,
  }).run();

  const response1 = await fetch(port).get(handlerQueryReceiver.route, { params: { message: 'query message' } });
  const received1 = JSON.stringify(response1.data);
  const expected1 = JSON.stringify({ message: 'query message received' });

  expect(response1.status).toBe(200);
  expect(received1).toBe(expected1);

  const response2 = await fetch(port).post(handlerBodyReceiver.route, { message: 'body message' });
  const received2 = JSON.stringify(response2.data);
  const expected2 = JSON.stringify({ message: 'body message received' });

  expect(response2.status).toBe(201);
  expect(received2).toBe(expected2);

  await server.closeAsync();
});

test('server-based invokes middleware for handler provided', async () => {
  const handlerWithMiddleware = {
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
          message: `${message} received`,
          middlewareMessage: `${middlewareMessage} received`,
        })
        .send();
    },
  };

  const port = 8005;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    handlers: [handlerWithMiddleware],
    runningPort: port,
  }).run();

  const response = await fetch(port).get(handlerWithMiddleware.route, { params: { message: 'query message' } });
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
  const handlerWithParams = {
    route: '/params-message/:messageId',
    method: 'GET',
    handlerType: 'context',
    run(context) {
      const { messageId } = context.fetchRequest().params;
      context
        .provideReply({
          message: `${messageId} received`,
        })
        .send();
    },
  };

  const port = 8006;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    handlers: [handlerWithParams],
    runningPort: 8006,
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
  const handlerWithContextType = {
    route: '/context-message',
    method: 'PUT',
    handlerType: 'context',
    run(context) {
      const { message } = context.fetchRequest().body;
      context
        .provideReply({
          message: `context ${message} received`,
        })
        .send();
    },
  };

  const handlerWithOriginType = {
    route: '/origin-message',
    method: 'PUT',
    handlerType: 'origin',
    run(req, res) {
      const { message } = req.body;
      res.send({
        message: `origin ${message} received`,
      });
    },
  };

  const port = 8007;
  const server = await serverBased({
    title: 'e-commerce',
    purpose: 'api',
    version: 'v0.0.1',
    handlers: [handlerWithContextType, handlerWithOriginType],
    runningPort: port,
  }).run();

  const message1 = 'context put message';
  const response1 = await fetch(port).put(handlerWithContextType.route, { message: message1 });
  const received1 = JSON.stringify(response1.data);
  const expected1 = JSON.stringify({
    message: `context ${message1} received`,
  });

  expect(response1.status).toBe(200);
  expect(received1).toBe(expected1);

  const message2 = 'origin put message';
  const response2 = await fetch(port).put(handlerWithOriginType.route, { message: message2 });
  const received2 = JSON.stringify(response2.data);
  const expected2 = JSON.stringify({
    message: `origin ${message2} received`,
  });

  expect(response2.status).toBe(200);
  expect(received2).toBe(expected2);

  await server.closeAsync();
});
