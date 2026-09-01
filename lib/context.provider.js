class ContextProvider {
  constructor(req = {}, res = {}, stateStore = new Map()) {
    this._req = req;
    this._res = res;
    this._stateStore = stateStore;
    this.reply = {};
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

  // cache payload, shared across requests for the lifetime of the app instance (see `stateStore` in server-based.js)
  provideState(key, value) {
    this._stateStore.set(key, value);
    return this;
  }

  // fetch payload
  conductState(key) {
    return this._stateStore.get(key);
  }
}

const injectContext = (handler, stateStore) => {
  return async (req, res, next) => {
    try {
      const context = new ContextProvider(req, res, stateStore);
      await handler(context, next);
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { injectContext };
