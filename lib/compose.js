const { ServerBasedError } = require('./server-based');

class ComposeError extends ServerBasedError {
  constructor(message) {
    super(message);
    this.name = 'ComposeError';
  }
}

// module: { handlers?: [...], middlewares?: [...] } — e.g. what example/todo-app, example/blog-app export.
// Merges them into one { handlers, middlewares } pair suitable for serverBased(), rejecting
// two modules that register the same method+route so composition failures surface at startup, not at runtime.
// Accepts any number of modules — see example/combined-2-apps and example/combined-3-apps.
const composeModules = (...modules) => {
  const handlers = [];
  const middlewares = [];
  const seenRoutes = new Set();

  for (const module of modules) {
    for (const handler of module.handlers || []) {
      const routeKey = `${(handler.method || '').toLowerCase()} ${handler.route}`;
      if (seenRoutes.has(routeKey)) {
        throw new ComposeError(`duplicate route registered by multiple modules: ${routeKey}`);
      }
      seenRoutes.add(routeKey);
      handlers.push(handler);
    }

    middlewares.push(...(module.middlewares || []));
  }

  return { handlers, middlewares };
};

module.exports = { composeModules, ComposeError };
