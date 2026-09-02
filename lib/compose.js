const { ServerBasedError } = require('./server-based');

class ComposeError extends ServerBasedError {
  constructor(message) {
    super(message);
    this.name = 'ComposeError';
  }
}

// module: { handlers?: [...], middlewares?: [...], plugins?: [...] } — e.g. what example/todo-app,
// example/blog-app, example/mini-store export. Merges them into one { handlers, middlewares, plugins }
// triple suitable for serverBased(), rejecting two modules that register the same method+route or the
// same plugin name, so composition failures surface at startup, not at runtime.
// Accepts any number of modules — see example/combined-2-apps and example/combined-3-apps.
const composeModules = (...modules) => {
  const handlers = [];
  const middlewares = [];
  const plugins = [];
  const seenRoutes = new Set();
  const seenPluginNames = new Set();

  for (const module of modules) {
    for (const handler of module.handlers || []) {
      const routeKey = `${(handler.method || '').toLowerCase()} ${handler.route}`;
      if (seenRoutes.has(routeKey)) {
        throw new ComposeError(`duplicate route registered by multiple modules: ${routeKey}`);
      }
      seenRoutes.add(routeKey);
      handlers.push(handler);
    }

    for (const plugin of module.plugins || []) {
      if (seenPluginNames.has(plugin.name)) {
        throw new ComposeError(`duplicate plugin name registered by multiple modules: ${plugin.name}`);
      }
      seenPluginNames.add(plugin.name);
      plugins.push(plugin);
    }

    middlewares.push(...(module.middlewares || []));
  }

  return { handlers, middlewares, plugins };
};

module.exports = { composeModules, ComposeError };
