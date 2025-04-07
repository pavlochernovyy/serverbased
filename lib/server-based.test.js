/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const axios = require('axios/dist/node/axios.cjs');
const fetch = axios.create({
  baseURL: 'http://localhost:8080',
});

const { serverBased, defaults } = require('./server-based');
const { toHandler } = require('./handler');

test('server-based creates own entity successfully', () => {
  const payload = {
    title: 'e-commerce',
    purpose: 'http api',
    version: 'v0.0.1',
  };

  const server = serverBased(payload);
  const { title, purpose, version, handlers, run, endpointType, routerEngine, runningPort, runningMode, networkMode } =
    server;

  expect(title).toBe(payload.title);
  expect(purpose).toBe(payload.purpose);
  expect(version).toBe(payload.version);
  expect(runningPort).toBe(defaults.runningPort);
  expect(runningMode).toBe(defaults.runningMode.server);
  expect(networkMode).toBe(defaults.networkMode.http);
  expect(routerEngine).toBe(defaults.routerEngine.express);
  expect(endpointType).toBe(defaults.endpointType.server);
  expect(JSON.stringify(handlers)).toBe(JSON.stringify({}));
  expect(typeof run).toBe('function');
});

test('server-based registers handler and run the http server for', async () => {
  const handlerAuditLogs = toHandler({
    route: '/audit-logs',
    method: 'GET',
    run(req, res) {
      res.send({ message: 'audit logs run' });
    },
  });

  const server = serverBased({
    handlers: [handlerAuditLogs],
  }).run();

  console.log(handlerAuditLogs.route);
  const response = await fetch.get(handlerAuditLogs.route);
  expect(response.status).toBe(200);
  expect(JSON.stringify(response.data)).toBe(JSON.stringify({ message: 'audit logs run' }));

  await server.closeAsync();
});

test(`server-based handles json data for handler's body per request`, async () => {
  const handlerBodyReceiver = toHandler({
    route: '/body-message-handler',
    method: 'POST',
    run(req, res) {
      const { message } = req.body;
      res.status(201).send({ message: `${message} received` });
    },
  });

  const server = serverBased({
    handlers: [handlerBodyReceiver],
  }).run();

  const response = await fetch.post(handlerBodyReceiver.route, { message: 'body message' });
  expect(response.status).toBe(201);
  expect(JSON.stringify(response.data)).toBe(JSON.stringify({ message: 'body message received' }));

  await server.closeAsync();
});

test('server-based handles few handlers with different payload', async () => {
  const handlerParamsReceiver = toHandler({
    route: '/params-message',
    method: 'GET',
    run(req, res) {
      const { message } = req.query;
      res.send({ message: `${message} received` });
    },
  });

  const handlerBodyReceiver = toHandler({
    route: '/body-message',
    method: 'POST',
    run(req, res) {
      const { message } = req.body;
      res.status(201).send({ message: `${message} received` });
    },
  });

  const server = serverBased({
    handlers: [handlerParamsReceiver, handlerBodyReceiver],
  }).run();

  const response1 = await fetch.get(handlerParamsReceiver.route, { params: { message: 'query message' } });
  expect(response1.status).toBe(200);
  expect(JSON.stringify(response1.data)).toBe(JSON.stringify({ message: 'query message received' }));

  const response2 = await fetch.post(handlerBodyReceiver.route, { message: 'body message' });
  expect(response2.status).toBe(201);
  expect(JSON.stringify(response2.data)).toBe(JSON.stringify({ message: 'body message received' }));

  await server.closeAsync();
});
