const { serverBased } = require('../../lib/server-based');
const { composeModules } = require('../../lib/compose');
const todoApp = require('../todo-app');
const blogApp = require('../blog-app');
const markdownApp = require('../markdown-app');

// Same composeModules(...) call as combined-2-apps, with one more module added —
// demonstrates that scaling to N feature modules costs nothing extra to wire up.
const { handlers, middlewares } = composeModules(todoApp, blogApp, markdownApp);

if (require.main === module) {
  serverBased({
    title: 'combined 3-apps (todo + blog + markdown)',
    purpose: 'todo + blog + markdown http api, composed from separate feature modules',
    version: '1.0',
    middlewares,
    handlers,
  })
    .run()
    .catch((error) => {
      console.error('combined 3-apps failed to start:', error.message);
      process.exit(1);
    });
}

module.exports = { handlers, middlewares };
