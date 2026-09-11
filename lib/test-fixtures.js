const fs = require('fs');
const os = require('os');
const path = require('path');

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

// Writes a function module (raw JS source, since serverBased({ configPath }) `require`s it from
// a real file) plus a serverbased.json pointing at it under a fresh temp dir, and returns the
// resulting configPath — for tests exercising serverBased(...) end-to-end now that configPath is
// the only way to register routes. `route: '/'` is a no-op mount prefix (Express doesn't add
// anything when mounted at root), so a handler's own route string is reachable unchanged.
// See lib/server-based.test.js, lib/error-handling.test.js, lib/context.provider.test.js.
const writeFunctionConfig = (source, { route = '/', id = 'fn' } = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-based-'));
  fs.writeFileSync(path.join(dir, `${id}.js`), source);
  const configPath = path.join(dir, 'serverbased.json');
  fs.writeFileSync(configPath, JSON.stringify({ functions: { [id]: { path: `./${id}.js`, route } } }));
  return configPath;
};

module.exports = { createSampleHandler, writeFunctionConfig };
