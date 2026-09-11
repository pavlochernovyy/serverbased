// Own plugin for the "cart" function (see ../cart.js) — proves a function loaded via
// serverbased.json can bring its own named plugin, reachable as context.cart inside its own
// handlers only. In-process, via context — not an HTTP call to another function.
class CartPlugin {
  constructor() {
    this._items = new Map();
  }

  addItem(item) {
    this._items.set(`${item.id}`, item);
    return this.getItems();
  }

  getItems() {
    return Object.fromEntries(this._items);
  }
}

module.exports = { CartPlugin };
