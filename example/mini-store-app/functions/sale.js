const { SalePlugin } = require('./plugins/sale.plugin');
const { fetchJson } = require('../../../lib/server-based');

// A function loaded via serverbased.json (see ../serverbased.json), mounted at /sale.
// Brings its own named "sale" plugin (functions/plugins/sale.plugin.js) — pure pricing logic,
// isolated from /cart's own store/plugin. /sale/:cartId/checkout needs the /cart function's
// cart items, which live behind /cart's own isolation boundary and are deliberately not reached
// into directly — instead this calls /cart's own public route over HTTP, the same
// cross-function pattern example/time-tracking-app/functions/reports.js uses for /entries.
const handlerCheckoutCart = {
  route: '/:cartId/checkout',
  method: 'GET',
  handlerType: 'context',
  async run(context) {
    const { cartId } = context.fetchRequest().params;
    const req = context.fetchRequest();

    const { data: items } = await fetchJson(`${req.protocol}://${req.get('host')}/cart/${cartId}`);

    context.provideReply({ data: context.sale.calculateTotal(items) }).send();
  },
};

module.exports = {
  handlers: [handlerCheckoutCart],
  plugins: [{ name: 'sale', plugin: SalePlugin }],
};
