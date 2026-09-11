const http = require('http');

// Exposed for function authors doing cross-function HTTP calls (see docs/state/open-items.md,
// "Cross-function data access goes over HTTP" — the deliberate pattern for a function reading
// another function's/the host app's data through its public route instead of reaching into its
// plugin/store directly). Node's built-in http module rather than global fetch — dependency-free,
// works under every Node/Jest combination this repo runs on (Jest's "node" test environment does
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

module.exports = { fetchJson };
