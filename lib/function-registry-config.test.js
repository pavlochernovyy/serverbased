const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('@jest/globals');
const { loadFunctionRegistryConfig, FunctionRegistryError } = require('./function-registry-config');

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'function-registry-'));

test('returns an empty list when configPath is not provided', () => {
  expect(loadFunctionRegistryConfig(undefined)).toEqual([]);
});

test('returns an empty list and does not throw when the config file does not exist', () => {
  expect(loadFunctionRegistryConfig('/does/not/exist/serverbased.json')).toEqual([]);
});

test('returns an empty list when functions is empty or absent', () => {
  const dir = makeTempDir();
  const configPath = path.join(dir, 'serverbased.json');
  fs.writeFileSync(configPath, JSON.stringify({ functions: {} }));

  expect(loadFunctionRegistryConfig(configPath)).toEqual([]);
});

test('loads a function module and resolves its path relative to the config file', () => {
  const dir = makeTempDir();
  fs.writeFileSync(
    path.join(dir, 'greet.js'),
    `module.exports = { handlers: [{ route: '/hi', method: 'GET', handlerType: 'origin', run(req, res) { res.send('ok'); } }] };`
  );
  const configPath = path.join(dir, 'serverbased.json');
  fs.writeFileSync(configPath, JSON.stringify({ functions: { greeter: { path: './greet.js', route: '/greeter' } } }));

  const [entry] = loadFunctionRegistryConfig(configPath);
  expect(entry.id).toBe('greeter');
  expect(entry.route).toBe('/greeter');
  expect(entry.handlers).toHaveLength(1);
  expect(entry.handlers[0].route).toBe('/hi');
});

test("loads a function module's own named plugins through toPlugin", () => {
  const dir = makeTempDir();
  fs.writeFileSync(
    path.join(dir, 'cart.js'),
    `class CartPlugin {}
     module.exports = { handlers: [], plugins: [{ name: 'cart', plugin: CartPlugin }] };`
  );
  const configPath = path.join(dir, 'serverbased.json');
  fs.writeFileSync(configPath, JSON.stringify({ functions: { cart: { path: './cart.js', route: '/cart' } } }));

  const [entry] = loadFunctionRegistryConfig(configPath);
  expect(entry.plugins).toHaveLength(1);
  expect(entry.plugins[0].name).toBe('cart');
  expect(typeof entry.plugins[0].plugin).toBe('function');
});

test('throws a FunctionRegistryError when a function entry is missing path or route', () => {
  const dir = makeTempDir();
  const configPath = path.join(dir, 'serverbased.json');
  fs.writeFileSync(configPath, JSON.stringify({ functions: { greeter: { route: '/greeter' } } }));

  expect(() => loadFunctionRegistryConfig(configPath)).toThrow(FunctionRegistryError);
});

test('throws a FunctionRegistryError when two functions register the same route', () => {
  const dir = makeTempDir();
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

  expect(() => loadFunctionRegistryConfig(configPath)).toThrow('duplicate function route registered: "/shared"');
});

test('throws a FunctionRegistryError when a function module has a duplicate internal route', () => {
  const dir = makeTempDir();
  fs.writeFileSync(
    path.join(dir, 'dup.js'),
    `module.exports = { handlers: [
      { route: '/x', method: 'GET', handlerType: 'origin', run() {} },
      { route: '/x', method: 'GET', handlerType: 'origin', run() {} },
    ] };`
  );
  const configPath = path.join(dir, 'serverbased.json');
  fs.writeFileSync(configPath, JSON.stringify({ functions: { dup: { path: './dup.js', route: '/dup' } } }));

  expect(() => loadFunctionRegistryConfig(configPath)).toThrow('duplicate route registered: get /x');
});
