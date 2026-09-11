const express = require('express');
const { injectContext } = require('./../lib/context.provider');
const { createStateStorePlugin } = require('./plugins/state-store.plugin');
const { fetchJson } = require('./fetch-json');

const defaults = {
  runningPort: 8080,
  networkProtocol: {
    http: 'http',
    socket: 'socket',
  },
  endpointType: {
    server: 'server',
    client: 'client',
  },
  handlerType: {
    context: 'context',
    origin: 'origin',
  },
};

class ServerBasedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServerBasedError';
  }
}

class HandlerError extends ServerBasedError {
  constructor(message) {
    super(message);
    this.name = 'HandlerError';
  }
}

class RuntimeError extends ServerBasedError {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'RuntimeError';
    this.statusCode = statusCode;
  }
}

const runtimeErrorHandlingMiddleware = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.info(`${req.method} ${req.originalUrl} failed:`, err);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).send({
    message: err.message || 'internal server error',
    name: err.name || RuntimeError.name,
  });
};

const traceServerBasedMetaData = ({ title, purpose, version } = {}) => {
  console.log('------- server-based metadata -----');
  console.log('title:', title);
  console.log('purpose:', purpose);
  console.log('version:', version);
};

const toHandler = ({ route, method, run, middleware, handlerType }) => {
  if (!route) {
    throw new HandlerError('route parameter is required');
  }
  if (!method) {
    throw new HandlerError('method parameter is required');
  }
  if (!run) {
    throw new HandlerError('run function is required');
  }
  if (!handlerType) {
    throw new HandlerError('handlerType parameter is required');
  }
  return {
    route,
    method: method.toLowerCase(),
    run,
    middleware,
    handlerType,
  };
};

const toPlugin = ({ name, plugin }) => {
  if (!name) {
    throw new ServerBasedError('plugin name is required');
  }
  if (!plugin) {
    throw new ServerBasedError('plugin constructor is required');
  }
  return { name, plugin };
};

// Throws via formatError(routeKey) on the first method+route repeated within `handlers`.
// Used by lib/function-registry-config.js for each function's own handlers, so every function
// gets the same fail-fast-at-startup guarantee for duplicate routes.
const assertNoDuplicateRoutes = (handlers, formatError) => {
  const seenRoutes = new Set();
  for (const handler of handlers) {
    const routeKey = `${handler.method} ${handler.route}`;
    if (seenRoutes.has(routeKey)) {
      throw formatError(routeKey);
    }
    seenRoutes.add(routeKey);
  }
};

// Registers handlers (already-validated toHandler() results) onto any Express-compatible
// router — used for each function's own express.Router() (see lib/function-registry-config.js)
// so every function gets identical context-injection wiring.
const registerHandlers = (router, handlers, pluginInstances) => {
  for (const appHandler of handlers) {
    const { method, route, run, middleware, handlerType } = appHandler;

    const handlerCommon = (...params) => {
      console.log(`${appHandler.method} ${route} invoked`);
      if (handlerType === defaults.handlerType.context) {
        return injectContext(run, pluginInstances)(...params);
      } else {
        return run(...params);
      }
    };

    if (middleware) {
      router[method](route, middleware.run, handlerCommon);
    } else {
      router[method](route, handlerCommon);
    }
  }
};

const serverBased = ({
  title,
  purpose,
  version,
  runningPort = defaults.runningPort,
  networkProtocol = defaults.networkProtocol.http,
  endpointType = defaults.endpointType.server,
  configPath,
}) => {
  if (!title) {
    throw new ServerBasedError('title parameter is required');
  }
  if (!purpose) {
    throw new ServerBasedError('purpose parameter is required');
  }
  if (!version) {
    throw new ServerBasedError('version parameter is required');
  }
  if (!configPath) {
    throw new ServerBasedError('configPath parameter is required');
  }
  if (networkProtocol !== defaults.networkProtocol.http) {
    throw new ServerBasedError(`networkProtocol: "${defaults.networkProtocol.http}" is only supported`);
  }
  return {
    title,
    purpose,
    version,
    runningPort,
    networkProtocol,
    endpointType,
    configPath,
    run() {
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));
      app.disable('x-powered-by');

      // Kept Promise-based rather than switching to callback style: run() is already
      // awaited/chained everywhere (examples, tests), and a callback would change that
      // call shape for every existing caller. The actual bug was that listen-time
      // failures (e.g. EADDRINUSE) had no path to the caller at all - the Promise just
      // never settled. Wiring the server's "error" event to reject() fixes that while
      // keeping run() a drop-in Promise: existing `await ...run()` callers now see a
      // rejection instead of hanging, and existing fire-and-forget callers can opt in
      // with `.catch(...)` when they care.
      const runServerBased = () => {
        return new Promise((resolve, reject) => {
          const server = app.listen(runningPort);

          server.once('error', (error) => {
            reject(error);
          });

          server.once('listening', () => {
            console.log('server-based started on a port:', runningPort);

            server.closeAsync = () => new Promise((resolve) => server.close(resolve));
            server.on('close', () => console.log('server-based is stopped'));
            resolve(server);
          });
        });
      };

      traceServerBasedMetaData({ title, purpose, version });

      // Functions loaded from serverbased.json (see lib/function-registry-config.js) — read
      // once at startup, mounted alongside each other, never watched/reloaded. Required lazily
      // to avoid a circular require at module-load time (function-registry-config.js requires
      // this file for ServerBasedError/toHandler/toPlugin/assertNoDuplicateRoutes).
      // loadFunctionRegistryConfig already guarantees every returned entry has a unique `route`
      // (it throws before returning otherwise, see lib/function-registry-config.js) — no need to
      // re-check that here.
      const { loadFunctionRegistryConfig } = require('./function-registry-config');
      const functionEntries = loadFunctionRegistryConfig(configPath);
      console.log(`server-based: ${functionEntries.length} function(s) mounted`);

      for (const functionEntry of functionEntries) {
        const functionRouter = express.Router();
        for (const middleware of functionEntry.middlewares) {
          functionRouter.use(middleware);
        }
        // Plugins are instantiated fresh on every run() call, so separate app instances
        // (e.g. separate test servers) never share plugin state, and every function's
        // instances are isolated from every other function's. The default "store" plugin
        // (see lib/plugins/state-store.plugin.js) is appended only when the function hasn't
        // supplied its own plugin named "store".
        const functionPluginDescriptors = functionEntry.plugins.some((descriptor) => descriptor.name === 'store')
          ? functionEntry.plugins
          : [...functionEntry.plugins, createStateStorePlugin()];
        const functionPluginInstances = functionPluginDescriptors.map(({ name, plugin: Plugin }) => ({
          name,
          instance: new Plugin(),
        }));
        registerHandlers(functionRouter, functionEntry.handlers, functionPluginInstances);
        app.use(functionEntry.route, functionRouter);
      }

      app.use(runtimeErrorHandlingMiddleware);

      return runServerBased();
    },
  };
};

module.exports = {
  serverBased,
  toHandler,
  toPlugin,
  assertNoDuplicateRoutes,
  defaults,
  ServerBasedError,
  HandlerError,
  RuntimeError,
  fetchJson,
};
