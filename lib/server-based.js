const express = require('express');
const { injectContext } = require('./../lib/context.provider');

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

const logServerBasedMeta = ({ title, purpose, version, handlers } = {}) => {
  console.log('------- server-based metadata -----');
  console.log('title:', title);
  console.log('purpose:', purpose);
  console.log('version:', version);
  console.log('------- server-based handlers -----');
  console.log('handlers:', handlers);
};

// so we have two configs, one is about the framework setup and another is about handler setup?
// hmm, make sense though...
const toHandler = ({ route, method, run, middleware, handlerType = defaults.handlerType.context }) => ({
  route,
  method: method.toLowerCase(),
  run,
  middleware,
  handlerType,
});

const serverBased = ({
  title,
  purpose,
  version,
  runningPort = defaults.runningPort,
  runningMode = defaults.runningMode.server,
  networkProtocol = defaults.networkProtocol.http,
  routerEngine = defaults.routerEngine.express,
  endpointType = defaults.endpointType.server,
  useMiddlewares,
  handlers = {},
  run,
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
  if (useMiddlewares) {
    console.warn('use middlewares hook is not currently supported');
  }
  if (run) {
    console.warn('custom run function is not currently supported');
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
    useMiddlewares,
    handlers,
    run() {
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));
      app.disable('x-powered-by');

      const runServerBased = () => {
        const server = app.listen(runningPort, () => {
          console.log('server-based started on a port:', runningPort);

          server.closeAsync = () => new Promise((resolve) => server.close(resolve));
          server.on('close', () => console.log('server-based is stopped'));
        });

        return server;
      };

      logServerBasedMeta({ title, purpose, version, handlers });

      for (const appHandler of handlers) {
        const { method, route, run, middleware, handlerType } = toHandler(appHandler);

        const contextHandler = (...params) => {
          console.log(`context handler for "${route}" invoked`);
          return injectContext(run)(...params);
        };

        const originHandler = (...params) => {
          console.log(`origin handler for "${route}" invoked`);
          return run(...params);
        };

        const mainHandler = handlerType === 'context' ? contextHandler : originHandler;

        if (middleware) {
          app[method](route, middleware.run, mainHandler);
        } else {
          app[method](route, mainHandler);
        }
      }

      return runServerBased();
    },
  };
};

module.exports = { serverBased, toHandler, defaults };
