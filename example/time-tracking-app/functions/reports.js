const http = require('http');

// Node's built-in http module rather than global fetch — kept dependency-free and works
// under every Node/Jest combination this repo runs on (Jest's "node" test environment does
// not expose global fetch even on a Node version that has it natively).
const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });

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
    // right, so we made an ability to communicate with standalone services deployed as an app, besides the function...
    // we use http layer to do so, no internal functions (helpers) to use...
    // I think this is good, since, we do have a proper isolation between each other...
    // we can make a common third party storage if we need to...
    // currently there is no need to have it, as we can easily collect data on the fly...
    // I would say, having a common storage from the outside is a good choice, when we want to process that data afterwards...
    // like having a scheduler function to do so...
    // hmm... actually making a scheduler function would be a good idea here...
    // we do have a config file (.json)...
    // I think we could introduce a new property to that file structure in order to satisfy such need...
    const { data: entries } = await fetchJson(`${req.protocol}://${req.get('host')}/entries`);

    const totalDurationMs = entries.reduce((sum, entry) => sum + (entry.durationMs || 0), 0);

    context.provideReply({ data: { entryCount: entries.length, totalDurationMs, summaryRequests } }).send();
  },
};

module.exports = { handlers: [handlerGetSummary] };
