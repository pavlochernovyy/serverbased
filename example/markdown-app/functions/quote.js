const jsonToMd = require('json2md');

// A function loaded via serverbased.json (see ../serverbased.json), mounted at /quote.
// The handler's own route is "/" (the function's mount point is the whole meaningful path) —
// same convention example/time-tracking-app/functions/projects.js already uses.
const handlerGetQuote = {
  route: '/',
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

module.exports = {
  handlers: [handlerGetQuote],
  middlewares: [cacheMarkdownData],
};
