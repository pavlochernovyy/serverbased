/**
 * @jest-environment node
 */
const path = require('path');
const { expect } = require('@jest/globals');
const axios = require('axios/dist/node/axios.cjs');
const fetch = (port) =>
  axios.create({
    baseURL: `http://localhost:${port}`,
  });

const { serverBased } = require('../../lib/server-based');
const { handlers } = require('./index');

test('declarative app handlers and config-loaded functions work side by side on one server', async () => {
  const port = 8022;
  const server = await serverBased({
    title: 'time tracking app',
    purpose: 'http api',
    version: '1.0',
    handlers,
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

  // config-driven side: /projects, from functions/projects.js
  const createdProject = await fetch(port).post('/projects', { id: 'p1', name: 'server-based' });
  expect(createdProject.status).toBe(201);
  expect(createdProject.data).toEqual({ data: { id: 'p1', name: 'server-based' } });

  const projects = await fetch(port).get('/projects');
  expect(projects.data).toEqual({ data: [{ id: 'p1', name: 'server-based' }] });

  // declarative side: /entries, from index.js's own `handlers`
  const started = await fetch(port).post('/entries/start', { id: 'e1', taskId: 'p1' });
  expect(started.status).toBe(201);
  expect(started.data.data).toMatchObject({ id: 'e1', taskId: 'p1', stoppedAt: null, durationMs: null });

  const stopped = await fetch(port).post('/entries/e1/stop');
  expect(stopped.status).toBe(200);
  expect(stopped.data.data.stoppedAt).not.toBeNull();
  expect(stopped.data.data.durationMs).toBeGreaterThanOrEqual(0);

  const entries = await fetch(port).get('/entries');
  expect(entries.data.data).toHaveLength(1);
  expect(entries.data.data[0].id).toBe('e1');

  await server.closeAsync();
});

test('stopping an unknown entry responds 404 without touching the config-loaded /projects state', async () => {
  const port = 8023;
  const server = await serverBased({
    title: 'time tracking app',
    purpose: 'http api',
    version: '1.0',
    handlers,
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

  const response = await fetch(port)
    .post('/entries/missing/stop')
    .catch((error) => error.response);
  expect(response.status).toBe(404);

  const projects = await fetch(port).get('/projects');
  expect(projects.data).toEqual({ data: [] });

  await server.closeAsync();
});

test('/entries, /projects and /reports each get their own isolated default "store"', async () => {
  const port = 8024;
  const server = await serverBased({
    title: 'time tracking app',
    purpose: 'http api',
    version: '1.0',
    handlers,
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

  await fetch(port).post('/entries/start', { id: 'e1', taskId: 'p1' });
  await fetch(port).post('/entries/e1/stop');
  await fetch(port).post('/projects', { id: 'p1', name: 'server-based' });

  // A key written under /entries' store ("entries") is not visible from /projects' or
  // /reports' store, and vice versa — each function's default store is a fresh Map instance.
  const projects = await fetch(port).get('/projects');
  expect(projects.data.data).toEqual([{ id: 'p1', name: 'server-based' }]);

  const entries = await fetch(port).get('/entries');
  expect(entries.data.data).toHaveLength(1);

  // /reports/summary writes its own "summaryRequests" key on every call — confirms it has a
  // working store of its own, separate from /entries' and /projects'.
  const summary1 = await fetch(port).get('/reports/summary');
  expect(summary1.data.data.summaryRequests).toBe(1);
  const summary2 = await fetch(port).get('/reports/summary');
  expect(summary2.data.data.summaryRequests).toBe(2);

  // Calling /reports/summary never touched /entries' or /projects' own store state.
  const projectsAfter = await fetch(port).get('/projects');
  expect(projectsAfter.data.data).toEqual([{ id: 'p1', name: 'server-based' }]);
  const entriesAfter = await fetch(port).get('/entries');
  expect(entriesAfter.data.data).toHaveLength(1);

  await server.closeAsync();
});

test('/reports/summary reads /entries data over HTTP, across the store isolation boundary', async () => {
  const port = 8025;
  const server = await serverBased({
    title: 'time tracking app',
    purpose: 'http api',
    version: '1.0',
    handlers,
    configPath: path.join(__dirname, 'serverbased.json'),
    runningPort: port,
  }).run();

  await fetch(port).post('/entries/start', { id: 'e1', taskId: 'p1' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await fetch(port).post('/entries/e1/stop');

  await fetch(port).post('/entries/start', { id: 'e2', taskId: 'p1' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await fetch(port).post('/entries/e2/stop');

  const summary = await fetch(port).get('/reports/summary');
  expect(summary.status).toBe(200);
  expect(summary.data.data.entryCount).toBe(2);
  expect(summary.data.data.totalDurationMs).toBeGreaterThan(0);

  await server.closeAsync();
});
