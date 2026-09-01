const jsonToMd = require('json2md');
const { serverBased } = require('../../lib/server-based');

const handlerGetQuote = {
  route: '/quote',
  method: 'GET',
  middleware: {
    run(req, res, next) {
      console.log('in middleware');
      next();
    },
  },
  handlerType: 'context',
  run(context) {
    const { title = 'not provided', text = 'not provided' } = context.fetchRequest().query;
    const data = jsonToMd([
      {
        h2: title,
        blockquote: text,
      },
    ]);
    context.provideReply(data).send();
  },
};

const cacheMarkdownData = (req, res, next) => {
  console.log('in cacheMarkdownData');
  next();
};

const handlers = [handlerGetQuote];
const middlewares = [cacheMarkdownData];

if (require.main === module) {
  serverBased({
    title: 'quote making app',
    purpose: 'http api',
    version: '1.0',
    handlers,
    middlewares,
  }).run();
}

module.exports = { handlers, middlewares };
