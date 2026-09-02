class ContextProvider {
  // plugins: [{ name, instance }] — each instance is exposed on the context under its name,
  // e.g. { name: 'cart', instance: cartPluginInstance } becomes accessible as context.cart.
  // Instances are built once per serverBased().run() call (see server-based.js) and shared
  // across every request of that app instance, isolated from any other app instance.
  constructor(req = {}, res = {}, plugins = []) {
    this._req = req;
    this._res = res;
    this.reply = {};

    for (const { name, instance } of plugins) {
      this[name] = instance;
    }
  }

  fetchParamsInt(scopeToInt) {
    const reqParams = this._req.params;
    if (!scopeToInt) return reqParams;
    const params = {};
    Object.entries(reqParams).forEach(([key, value]) => {
      params[key] = scopeToInt.includes(key) ? parseInt(value, 10) : value;
    });
    return params;
  }

  fetchRequest() {
    return this._req;
  }

  provideReply(data) {
    this.reply = data;
    return this;
  }

  send() {
    this._res.send(this.reply);
  }

  sendWithCode(code) {
    this._res.status(code).send(this.reply);
  }

  // Thin wrapper around the "store" plugin (a Map-like object exposing get/set) — see
  // lib/plugins/state-store.plugin.js for the default, auto-injected by server-based.js
  // when no "store" plugin is supplied. Cached payload, shared across requests for the
  // lifetime of the app instance.
  provideState(key, value) {
    this.store.set(key, value);
    return this;
  }

  // fetch payload
  conductState(key) {
    return this.store.get(key);
  }
}

const injectContext = (handler, plugins) => {
  return async (req, res, next) => {
    try {
      const context = new ContextProvider(req, res, plugins);
      await handler(context, next);
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { ContextProvider, injectContext };
