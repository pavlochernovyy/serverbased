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

// Throws via formatError(routeKey) on the first method+route repeated within `handlers`.
// Shared between serverBased()'s own top-level handlers and each function's own handlers
// (see lib/function-registry-config.js) so both get the same fail-fast-at-startup guarantee
// compose.js already has for duplicate routes across composed modules.
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
// router (the top-level app, or a function's own express.Router()) with the same
// context-injection wiring. Shared so serverBased()'s own handlers and functions loaded
// from serverbased.json (see lib/function-registry-config.js) behave identically.
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
  runningMode = defaults.runningMode.server,
  networkProtocol = defaults.networkProtocol.http,
  routerEngine = defaults.routerEngine.express,
  endpointType = defaults.endpointType.server,
  handlers = [],
  middlewares = [],
  plugins = [],
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
    configPath,
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
        // they are used globally...
        // can we attach the middleware provided for particular module's route, not the app?
        // I think we need to have such option as globalMiddleware provided when needed though...
        // but for our case, we need to apply middleware just for the app's route provided...
        // as I think we do?
        // ohh no...
        // we do create const app = express(); actually here (in run function)...
        // I think we need to change our api a bit, to be able to create it within a factory, so we can make as many serverbased apps chained together as we need, and run just once after?..
        // hmm, that could make sense...

        // I think we need to remove an ability to make standalone serverbased;
        // We need to follow config path approach, where all our modules are functions - property initialized and assigned by the framework, which reads the config and does it own
        // I think this is the path, where to I wanted to go
        // This should simplify a lot of code with apps combination, hence we still can have them separately located, but mounted on the same app with no need for many express instances
        // they also would be able to communicate by http, without a need to import such modules for use internally, which prevents potential module cycling issue;

        // Summary:
        // I propose to reduce our framework to the way it operates just functions by own logic based on config provided
        // As a developers to the framework, we simply update an api to serverbased.json structure with optional fields added in future
        // external users would appreciate such simplification (as no typings would be needed)
        // Update example apps, so we use common approach to them as we use to /time-tracking-app where /functions folder is a good practise to have
        // with serverbased.json and corresponding test file in the project's root
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

      const resolvedHandlers = handlers.map(toHandler);
      assertNoDuplicateRoutes(
        resolvedHandlers,
        (routeKey) => new ServerBasedError(`duplicate route registered: ${routeKey}`)
      );
      registerHandlers(app, resolvedHandlers, pluginInstances);

      // Functions loaded from serverbased.json (see lib/function-registry-config.js) — read
      // once at startup, mounted alongside the app's own handlers, never watched/reloaded.
      // Required lazily to avoid a circular require at module-load time (function-registry-config.js
      // requires this file for ServerBasedError/toHandler/toPlugin/assertNoDuplicateRoutes).
      const { loadFunctionRegistryConfig } = require('./function-registry-config');
      const functionEntries = loadFunctionRegistryConfig(configPath);

      const seenHostRoutes = new Set(resolvedHandlers.map((handler) => handler.route));
      for (const functionEntry of functionEntries) {
        if (seenHostRoutes.has(functionEntry.route)) {
          throw new ServerBasedError(
            `function "${functionEntry.id}": route "${functionEntry.route}" collides with an existing handler route`
          );
        }
        seenHostRoutes.add(functionEntry.route);

        const functionRouter = express.Router();
        for (const middleware of functionEntry.middlewares) {
          functionRouter.use(middleware);
        }
        // Same default-"store"-when-not-supplied behavior as the host app's own plugins
        // (see pluginDescriptors above) — each function gets its own fresh Map instance,
        // isolated from the host's store and from every other function's store.
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
};
