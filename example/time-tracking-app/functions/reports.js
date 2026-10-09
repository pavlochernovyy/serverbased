const { fetchJson } = require('../../../lib/server-based');

// A function loaded via serverbased.json (see ../serverbased.json), mounted at /reports.
// Has its own default "store" plugin, isolated from /entries' (the host app's) and /projects'
// stores — same as projects.js, see run() in lib/server-based.js.
//
// /reports/summary needs data that lives in the host app's own store (/entries), which this
// function's isolated store cannot see and deliberately does not reach into directly — each
// function's default store simulates a separate database, the same way a real microservice
// would not read another service's database directly. Instead it calls the host's own public
// /entries endpoint over HTTP, exactly like a separate service would query another service's
// API — isolation stays intact, and the dependency between /reports and /entries is explicit
// (a network call) rather than a hidden shared-memory reference.
const handlerGetSummary = {
  route: '/summary',
  method: 'GET',
  handlerType: 'context',
  async run(context) {
    const summaryRequests = (context.conductState('summaryRequests') || 0) + 1;
    context.provideState('summaryRequests', summaryRequests);

    const req = context.fetchRequest();
    // the host is the same, what they do, they refer to it and ask to get a resource by the entries path...
    const { data: entries } = await fetchJson(`${req.protocol}://${req.get('host')}/entries`);

    const totalDurationMs = entries.reduce((sum, entry) => sum + (entry.durationMs || 0), 0);

    context.provideReply({ data: { entryCount: entries.length, totalDurationMs, summaryRequests } }).send();
  },
};

module.exports = { handlers: [handlerGetSummary] };
