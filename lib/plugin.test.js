/**
 * @jest-environment node
 */
const { expect } = require('@jest/globals');
const { toPlugin, ServerBasedError } = require('./server-based');

class SamplePlugin {}

test('toPlugin creates own entity successfully', () => {
  const payload = { name: 'sample', plugin: SamplePlugin };
  const samplePlugin = toPlugin(payload);

  expect(samplePlugin.name).toBe(payload.name);
  expect(samplePlugin.plugin).toBe(SamplePlugin);
});

test('toPlugin throws when name is missing', () => {
  expect(() => toPlugin({ plugin: SamplePlugin })).toThrow(ServerBasedError);
});

test('toPlugin throws when plugin constructor is missing', () => {
  expect(() => toPlugin({ name: 'sample' })).toThrow(ServerBasedError);
});
