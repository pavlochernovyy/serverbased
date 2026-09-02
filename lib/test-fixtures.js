// Shared sample handler shape for tests that need a realistic handler config
// without caring about its specifics (e.g. handler.test.js, compose.test.js).
const createSampleHandler = (overrides = {}) => ({
  route: '/sample',
  method: 'GET',
  middleware: { run() {} },
  handlerType: 'origin',
  run() {},
  ...overrides,
});

module.exports = { createSampleHandler };
