const path = require('path');
const { serverBased } = require('../../lib/server-based');

if (require.main === module) {
  serverBased({
    title: 'markdown app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
  })
    .run()
    .catch((error) => {
      console.error('markdown app failed to start:', error.message);
      process.exit(1);
    });
}
