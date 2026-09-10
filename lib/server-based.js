const express = require('express');
const { injectContext } = require('./../lib/context.provider');
const { createStateStorePlugin } = require('./plugins/state-store.plugin');

const defaults = {
  runningPort: 8080,
  runningMode: {
    server: 'server',
    lambda: 'lambda',
  },
  networkProtocol: {
    http: 'http',
    socket: 'socket',
  },
  routerEngine: {
    express: 'express',
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

const traceServerBasedMetaData = ({ title, purpose, version, handlers } = {}) => {
  console.log('------- server-based metadata -----');
  console.log('title:', title);
  console.log('purpose:', purpose);
  console.log('version:', version);
  console.log('------- server-based handlers -----');
  console.log('handlers:', handlers);
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

const serverBased = ({
  title,
  purpose,
  version,
  runningPort = defaults.runningPort,
  runningMode = defaults.runningMode.server,
  networkProtocol = defaults.networkProtocol.http,
  routerEngine = defaults.routerEngine.express,
  endpointType = defaults.endpointType.server,
  handlers = {},
  middlewares = [],
  plugins = [],
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
  if (networkProtocol !== defaults.networkProtocol.http) {
    throw new ServerBasedError(`networkProtocol: "${defaults.networkProtocol.http}" is only supported`);
  }
  return {
    title,
    purpose,
    version,
    runningPort,
    runningMode,
    networkProtocol,
    routerEngine,
    endpointType,
    handlers,
    middlewares,
    plugins,
    run() {
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));
      app.disable('x-powered-by');

      // Plugins are instantiated fresh on every run() call (like stateStore was before),
      // so separate app instances (e.g. separate test servers) never share plugin state.
      // The default "store" plugin (see lib/plugins/state-store.plugin.js) is appended
      // only when the caller hasn't supplied their own plugin named "store".
      const seenPluginNames = new Set();
      const pluginDescriptors = plugins.map(toPlugin).map((descriptor) => {
        if (seenPluginNames.has(descriptor.name)) {
          throw new ServerBasedError(`duplicate plugin name registered: "${descriptor.name}"`);
        }
        seenPluginNames.add(descriptor.name);
        return descriptor;
      });
      if (!seenPluginNames.has('store')) {
        pluginDescriptors.push(createStateStorePlugin());
      }
      const pluginInstances = pluginDescriptors.map(({ name, plugin: Plugin }) => ({
        name,
        instance: new Plugin(),
      }));

      for (const middleware of middlewares) {
        app.use(middleware);
      }

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

      traceServerBasedMetaData({ title, purpose, version, handlers });

      for (const appHandler of handlers) {
        const { method, route, run, middleware, handlerType } = toHandler(appHandler);

        const handlerCommon = (...params) => {
          console.log(`${appHandler.method} ${route} invoked`);
          if (handlerType === defaults.handlerType.context) {
            return injectContext(run, pluginInstances)(...params);
          } else {
            return run(...params);
          }
        };

        if (middleware) {
          app[method](route, middleware.run, handlerCommon);
        } else {
          app[method](route, handlerCommon);
        }
      }

      app.use(runtimeErrorHandlingMiddleware);

      return runServerBased();
    },
  };
};

module.exports = { serverBased, toHandler, toPlugin, defaults, ServerBasedError, HandlerError, RuntimeError };
