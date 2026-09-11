const path = require('path');
const { serverBased } = require('../../lib/server-based');

// okay, sinse the function uses the same logic without having troubles with middleware as combined apps do
// I think we can simplify combined apps to function's way of doint it.
if (require.main === module) {
  serverBased({
    title: 'function registry app',
    purpose: 'http api',
    version: '1.0',
    handlers: [],
    configPath: path.join(__dirname, 'serverbased.json'),
  })
    .run()
    .catch((error) => {
      console.error('function registry app failed to start:', error.message);
      process.exit(1);
    });
}
