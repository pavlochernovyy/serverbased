/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const { toHandler } = require('./handler.js');

test('should make a default handler', () => {
  const payload = {
    route: '/sample',
    method: 'GET',
    run: () => {},
  };
  const sampleHandler = toHandler(payload);

  expect(sampleHandler.route).toBe(payload.route);
  expect(sampleHandler.method).toBe('get');
  expect(sampleHandler.run).toBe(payload.run);
});
