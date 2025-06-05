class ContextProvider {
  constructor(req = {}, res = {}) {
    this._req = req;
    this._res = res;
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

  // cache payload
  provideState() {}

  // fetch payload
  conductState() {}
}

const injectContext = (handler) => {
  return async (req, res, next) => {
    try {
      const context = new ContextProvider(req, res);
      await handler(context, next);
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { injectContext };
