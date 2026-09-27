// Express 4 does not forward rejected promises. Wrap registered route handlers
// before listening so ordinary request failures reach the existing error middleware.
function protectAsyncRoutes(app) {
  const visit = (stack) => {
    for (const layer of stack || []) {
      if (layer.route) {
        visit(layer.route.stack);
        continue;
      }
      if (layer.handle?.stack) {
        visit(layer.handle.stack);
        continue;
      }
      const handle = layer.handle;
      if (
        typeof handle !== "function" ||
        handle.length === 4 ||
        handle.asyncProtected
      )
        continue;
      const wrapped = function (req, res, next) {
        try {
          const result = handle(req, res, next);
          if (result && typeof result.catch === "function") result.catch(next);
        } catch (e) {
          next(e);
        }
      };
      wrapped.asyncProtected = true;
      layer.handle = wrapped;
    }
  };
  visit(app._router?.stack);
}
module.exports = { protectAsyncRoutes };
