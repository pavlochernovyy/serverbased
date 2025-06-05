/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const { toHandler } = require('./server-based');

test('toHandler creates own entity successfully', () => {
  const payload = {
    route: '/sample',
    method: 'GET',
    middleware: { run() {} },
    handlerType: 'origin',
    run() {},
  };
  const sampleHandler = toHandler(payload);

  expect(sampleHandler.route).toBe(payload.route);
  expect(sampleHandler.method).toBe('get');
  expect(sampleHandler.run).toBe(payload.run);
  expect(sampleHandler.middleware.run).toBe(payload.middleware.run);
  expect(sampleHandler.handlerType).toBe(payload.handlerType);
});
