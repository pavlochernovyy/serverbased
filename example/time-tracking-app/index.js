const path = require('path');
const { serverBased } = require('../../lib/server-based');

// App-level, declarative handlers — same pattern as example/todo-app — registered directly
// in this file's `handlers` array, sharing the default "store" plugin via provideState/conductState.
const seedEntries = () => new Map();

const handlerStartEntry = {
  route: '/entries/start',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { id, taskId } = context.fetchRequest().body;
    const entries = context.conductState('entries') || seedEntries();
    const entry = { id, taskId, startedAt: Date.now(), stoppedAt: null, durationMs: null };
    entries.set(id, entry);
    context.provideState('entries', entries);
    context.provideReply({ data: entry }).sendWithCode(201);
  },
};

const handlerStopEntry = {
  route: '/entries/:entryId/stop',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { entryId } = context.fetchRequest().params;
    const entries = context.conductState('entries') || seedEntries();
    const entry = entries.get(entryId);
    if (!entry) {
      context.provideReply({ message: `entry "${entryId}" not found` }).sendWithCode(404);
      return;
    }
    entry.stoppedAt = Date.now();
    entry.durationMs = entry.stoppedAt - entry.startedAt;
    entries.set(entryId, entry);
    context.provideState('entries', entries);
    context.provideReply({ data: entry }).send();
  },
};

const handlerListEntries = {
  route: '/entries',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const entries = context.conductState('entries') || seedEntries();
    context.provideReply({ data: [...entries.values()] }).send();
  },
};

const handlers = [handlerStartEntry, handlerStopEntry, handlerListEntries];

if (require.main === module) {
  serverBased({
    title: 'time tracking app',
    purpose: 'http api',
    version: '1.0',
    handlers,
    // Function-registry, config-driven side — see serverbased.json + functions/projects.js.
    // Mounted alongside the declarative `handlers` above in the same run().
    configPath: path.join(__dirname, 'serverbased.json'),
  })
    .run()
    .catch((error) => {
      console.error('time tracking app failed to start:', error.message);
      process.exit(1);
    });
}

module.exports = { handlers };
