const toHandler = ({ route, method, run }) => ({
  route,
  method: method.toLowerCase(),
  run,
});

module.exports = { toHandler };
