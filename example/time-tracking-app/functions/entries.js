const { EntriesStorePlugin } = require('./plugins/entries-store.plugin');

// A function loaded via serverbased.json (see ../serverbased.json), mounted at /entries.
// Overrides the default "store" plugin with EntriesStorePlugin
// (functions/plugins/entries-store.plugin.js) — no per-handler seedEntries() fallback needed.
// /reports/summary reads this function's data over HTTP (see functions/reports.js) rather than
// reaching into its store directly — the store stays isolated per function.
const handlerStartEntry = {
  route: '/start',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { id, taskId } = context.fetchRequest().body;
    const entries = context.conductState('entries');
    const entry = { id, taskId, startedAt: Date.now(), stoppedAt: null, durationMs: null };
    entries.set(id, entry);
    context.provideState('entries', entries);
    context.provideReply({ data: entry }).sendWithCode(201);
  },
};

const handlerStopEntry = {
  route: '/:entryId/stop',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { entryId } = context.fetchRequest().params;
    const entries = context.conductState('entries');
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
  route: '/',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const entries = context.conductState('entries');
    context.provideReply({ data: [...entries.values()] }).send();
  },
};

module.exports = {
  handlers: [handlerStartEntry, handlerStopEntry, handlerListEntries],
  plugins: [{ name: 'store', plugin: EntriesStorePlugin }],
};
