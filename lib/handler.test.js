/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const { toHandler } = require('./server-based');
const { createSampleHandler } = require('./test-fixtures');

test('toHandler creates own entity successfully', () => {
  const payload = createSampleHandler();
  const sampleHandler = toHandler(payload);

  expect(sampleHandler.route).toBe(payload.route);
  expect(sampleHandler.method).toBe('get');
  expect(sampleHandler.run).toBe(payload.run);
  expect(sampleHandler.middleware.run).toBe(payload.middleware.run);
  expect(sampleHandler.handlerType).toBe(payload.handlerType);
});
