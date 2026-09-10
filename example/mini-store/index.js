const { serverBased } = require('../../lib/server-based');
const { CartPlugin } = require('./cart.plugin');
const { SalePlugin } = require('./sale.plugin');

const handlerGetCart = {
  route: '/cart/:cartId',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { cartId } = context.fetchRequest().params;
    context.provideReply({ data: context.cart.getItems(cartId) }).send();
  },
};

const handlerAddItem = {
  route: '/cart/:cartId/items',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { cartId } = context.fetchRequest().params;
    const { id, name, price, qty } = context.fetchRequest().body;
    const items = context.cart.addItem(cartId, { id, name, price, qty });

    context.provideReply({ message: 'item added', data: items }).sendWithCode(201);
  },
};

const handlerRemoveItem = {
  route: '/cart/:cartId/items/:itemId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { cartId, itemId } = context.fetchRequest().params;
    const items = context.cart.removeItem(cartId, itemId);

    context.provideReply({ message: 'item removed', data: items }).send();
  },
};

const handlerClearCart = {
  route: '/cart/:cartId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { cartId } = context.fetchRequest().params;
    context.cart.clearCart(cartId);

    context.provideReply({ message: 'cart cleared' }).send();
  },
};

const handlerCheckoutCart = {
  route: '/cart/:cartId/checkout',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { cartId } = context.fetchRequest().params;
    const items = context.cart.getItems(cartId);

    context.provideReply({ data: context.sale.calculateTotal(items) }).send();
  },
};

const handlers = [handlerGetCart, handlerAddItem, handlerRemoveItem, handlerClearCart, handlerCheckoutCart];
const plugins = [
  { name: 'cart', plugin: CartPlugin },
  { name: 'sale', plugin: SalePlugin },
];

if (require.main === module) {
  serverBased({
    title: 'mini-store app',
    purpose: 'http api',
    version: '1.0',
    handlers,
    plugins,
  })
    .run()
    .catch((error) => {
      console.error('mini-store app failed to start:', error.message);
      process.exit(1);
    });
}

module.exports = { handlers, plugins };
