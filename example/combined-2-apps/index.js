const { serverBased } = require('../../lib/server-based');
const { composeModules } = require('../../lib/compose');
const todoApp = require('../todo-app');
const blogApp = require('../blog-app');

// Demonstrates extending a running app with another feature module later, without touching
// todo-app or blog-app themselves — each stays a self-contained { handlers, middlewares } export.
const { handlers, middlewares } = composeModules(todoApp, blogApp);

if (require.main === module) {
  serverBased({
    title: 'combined 2-apps (todo + blog)',
    purpose: 'todo + blog http api, composed from separate feature modules',
    version: '1.0',
    middlewares,
    handlers,
  })
    .run()
    .catch((error) => {
      console.error('combined 2-apps failed to start:', error.message);
      process.exit(1);
    });
}

module.exports = { handlers, middlewares };
