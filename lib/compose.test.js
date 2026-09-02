const { composeModules, ComposeError } = require('./compose');
const { createSampleHandler } = require('./test-fixtures');

test('merges handlers and middlewares from multiple modules, in order', () => {
  const moduleA = {
    handlers: [createSampleHandler({ route: '/a', method: 'GET' })],
    middlewares: [() => {}],
  };
  const moduleB = {
    handlers: [createSampleHandler({ route: '/b', method: 'GET' })],
    middlewares: [() => {}],
  };

  const composed = composeModules(moduleA, moduleB);

  expect(composed.handlers).toEqual([moduleA.handlers[0], moduleB.handlers[0]]);
  expect(composed.middlewares).toEqual([moduleA.middlewares[0], moduleB.middlewares[0]]);
});

test('tolerates a module with no middlewares', () => {
  const moduleA = { handlers: [createSampleHandler({ route: '/a', method: 'GET' })] };

  const composed = composeModules(moduleA);

  expect(composed.handlers).toEqual(moduleA.handlers);
  expect(composed.middlewares).toEqual([]);
});

test('treats routes as distinct per method', () => {
  const moduleA = { handlers: [createSampleHandler({ route: '/thing', method: 'GET' })] };
  const moduleB = { handlers: [createSampleHandler({ route: '/thing', method: 'POST' })] };

  const composed = composeModules(moduleA, moduleB);

  expect(composed.handlers).toHaveLength(2);
});

test('throws a ComposeError when two modules register the same method+route', () => {
  const moduleA = { handlers: [createSampleHandler({ route: '/thing', method: 'GET' })] };
  const moduleB = { handlers: [createSampleHandler({ route: '/thing', method: 'get' })] };

  expect(() => composeModules(moduleA, moduleB)).toThrow(ComposeError);
  expect(() => composeModules(moduleA, moduleB)).toThrow('get /thing');
});
