// Plugin demo: keeps per-cart item state for the lifetime of one serverBased() app instance —
// see lib/plugins/state-store.plugin.js for the framework's own default "store" plugin, and
// docs/api/context-provider.md for how plugins get attached onto the request context.
class CartPlugin {
  constructor() {
    this._carts = new Map();
  }

  _cart(cartId) {
    if (!this._carts.has(cartId)) {
      this._carts.set(cartId, new Map());
    }
    return this._carts.get(cartId);
  }

  getItems(cartId) {
    return Object.fromEntries(this._cart(cartId));
  }

  addItem(cartId, item) {
    this._cart(cartId).set(`${item.id}`, item);
    return this.getItems(cartId);
  }

  removeItem(cartId, itemId) {
    this._cart(cartId).delete(`${itemId}`);
    return this.getItems(cartId);
  }

  clearCart(cartId) {
    this._carts.delete(cartId);
  }
}

module.exports = { CartPlugin };
