const path = require('path');
const { serverBased } = require('../../lib/server-based');

if (require.main === module) {
  serverBased({
    title: 'hello world app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
  })
    .run()
    .catch((error) => {
      console.error('hello world app failed to start:', error.message);
      process.exit(1);
    });
}
