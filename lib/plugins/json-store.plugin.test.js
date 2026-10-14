/**
 * @jest-environment node
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('@jest/globals');
const { createJsonStorePlugin } = require('./json-store.plugin');

let dir;
let dataDir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-store-'));
  dataDir = path.join(dir, 'data');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const readStoreFile = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8'));

test('creates the missing data folder and a file named after the plugin, seeded', () => {
  const { plugin: Store } = createJsonStorePlugin('items', [['1', { a: 1 }]]);

  const store = new Store({ dataDir });

  expect([...store]).toEqual([['1', { a: 1 }]]);
  expect(readStoreFile('items')).toEqual({ 1: { a: 1 } });
});

test('persists every set/delete to the file', () => {
  const { plugin: Store } = createJsonStorePlugin('items', [['1', { a: 1 }]]);
  const store = new Store({ dataDir });

  store.set('2', { b: 2 });
  store.delete('1');

  expect(readStoreFile('items')).toEqual({ 2: { b: 2 } });
});

test('seeds when the file holds an empty collection', () => {
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'items.json'), '{}');
  const { plugin: Store } = createJsonStorePlugin('items', [['1', { a: 1 }]]);

  expect([...new Store({ dataDir })]).toEqual([['1', { a: 1 }]]);
});

test('loads existing entries instead of seeding', () => {
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'items.json'), JSON.stringify({ 7: { b: 2 } }));
  const { plugin: Store } = createJsonStorePlugin('items', [['1', { a: 1 }]]);

  expect([...new Store({ dataDir })]).toEqual([['7', { b: 2 }]]);
});

test('nextId continues from the highest existing id with the given prefix, not from size', () => {
  const { plugin: Store } = createJsonStorePlugin('items', [
    ['c1', {}],
    ['c5', {}],
    ['x9', {}],
  ]);
  const store = new Store({ dataDir });

  expect(store.nextId('c')).toBe('c6');
  expect(store.nextId('z')).toBe('z1');

  store.delete('c5');
  expect(store.nextId('c')).toBe('c2');
});
