const express = require('express');
const { toHandler } = require('./handler');

const defaults = {
  runningPort: 8080,
  runningMode: {
    server: 'server',
    lambda: 'lambda',
  },
  networkMode: {
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
  valueIsEmpty: 'empty',
};

const serverBased = ({
  title = defaults.valueIsEmpty,
  purpose = defaults.valueIsEmpty,
  version = defaults.valueIsEmpty,
  runningPort = defaults.runningPort,
  runningMode = defaults.runningMode.server,
  networkMode = defaults.networkMode.http,
  routerEngine = defaults.routerEngine.express,
  endpointType = defaults.endpointType.server,
  useMiddlewares,
  handlers = {},
  run,
}) => {
  return {
    title,
    purpose,
    version,
    runningPort,
    runningMode,
    networkMode,
    routerEngine,
    endpointType,
    useMiddlewares,
    handlers,
    run() {
      if (run) {
        console.log('custom run function is not currently supported');
      }

      const app = express();
      app.use(express.json()); // for parsing application/json
      app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

      if (useMiddlewares) {
        console.log('use middlewares hook is not currently supported');
      }

      const listen = () => {
        const server = app.listen(runningPort, () => {
          console.log('server has been started on port', runningPort);

          server.closeAsync = () => new Promise((resolve) => server.close(resolve));
          server.on('close', () => console.log('server has been closed'));
        });

        return server;
      };

      console.log(handlers);

      for (const appHandler of handlers) {
        const { method, route, run } = toHandler(appHandler);
        app[method](route, run);
      }

      return listen();
    },
  };
};

module.exports = { serverBased, defaults };
