const fs = require('fs');
const path = require('path');
const { ServerBasedError, toHandler, toPlugin, assertNoDuplicateRoutes } = require('./server-based');

class FunctionRegistryError extends ServerBasedError {
  constructor(message) {
    super(message);
    this.name = 'FunctionRegistryError';
  }
}

// serverbased.json shape: { "functions": { "<id>": { "path": "...", "route": "..." } } }.
// "path" is resolved relative to the config file itself, not process.cwd(). Each function's
// module keeps the same { handlers, middlewares?, plugins? } shape composeModules consumes.
// Reads/requires everything once, at startup (no fs.watch, no runtime reload) — see
// docs/function-registry.task.md for why.
const loadFunctionRegistryConfig = (configPath) => {
  if (!configPath) {
    return [];
  }

  const resolvedConfigPath = path.resolve(configPath);
  if (!fs.existsSync(resolvedConfigPath)) {
    console.log(`function registry: config not found at "${configPath}", skipping function loading`);
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf8'));
  const entries = Object.entries(parsed.functions || {});
  if (entries.length === 0) {
    console.log(`function registry: no functions listed in "${configPath}", skipping function loading`);
    return [];
  }

  const configDir = path.dirname(resolvedConfigPath);
  const seenRoutes = new Set();

  return entries.map(([id, entry = {}]) => {
    const { path: modulePath, route } = entry;
    if (!modulePath) {
      throw new FunctionRegistryError(`function "${id}": path is required`);
    }
    if (!route) {
      throw new FunctionRegistryError(`function "${id}": route is required`);
    }
    if (seenRoutes.has(route)) {
      throw new FunctionRegistryError(`duplicate function route registered: "${route}"`);
    }
    seenRoutes.add(route);

    const resolvedModulePath = path.resolve(configDir, modulePath);
    let mod;
    try {
      mod = require(resolvedModulePath);
    } catch (error) {
      throw new FunctionRegistryError(`function "${id}": failed to load "${modulePath}": ${error.message}`);
    }

    const handlers = (mod.handlers || []).map(toHandler);
    const plugins = (mod.plugins || []).map(toPlugin);

    assertNoDuplicateRoutes(
      handlers,
      (routeKey) => new FunctionRegistryError(`function "${id}": duplicate route registered: ${routeKey}`)
    );

    // Restores the duplicate-plugin-name guard serverBased()'s own top-level `plugins` loop used
    // to have before configPath became the only way to supply plugins (see config-only-composition
    // migration) — a function's own plugins need the same fail-fast-at-startup check.
    const seenPluginNames = new Set();
    for (const plugin of plugins) {
      if (seenPluginNames.has(plugin.name)) {
        throw new FunctionRegistryError(`function "${id}": duplicate plugin name registered: "${plugin.name}"`);
      }
      seenPluginNames.add(plugin.name);
    }

    return { id, route, handlers, middlewares: mod.middlewares || [], plugins };
  });
};

module.exports = { loadFunctionRegistryConfig, FunctionRegistryError };
