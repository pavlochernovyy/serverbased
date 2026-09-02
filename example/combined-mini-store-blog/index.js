const { serverBased } = require('../../lib/server-based');
const { composeModules } = require('../../lib/compose');
const blogApp = require('../blog-app');
const miniStoreApp = require('../mini-store');

// Composes blog-app (relies on the framework's default "store" plugin, via provideState/conductState)
// with mini-store (its own named "cart"/"sale" plugins) on one server — demonstrates that named
// plugins and the default store plugin coexist without colliding, and that composeModules merges
// `plugins` the same way it already merges `handlers`/`middlewares` (see lib/compose.js).
const { handlers, middlewares, plugins } = composeModules(blogApp, miniStoreApp);

if (require.main === module) {
  serverBased({
    title: 'combined blog + mini-store',
    purpose: 'blog + mini-store http api, composed from separate feature modules',
    version: '1.0',
    middlewares,
    handlers,
    plugins,
  }).run();
}

module.exports = { handlers, middlewares, plugins };
