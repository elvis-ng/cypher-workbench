import { assertAllowedGraphQLRequest, OperationGateError } from './operationGate.js';

export const httpOperationGate = (enabled = false) => (req, res, next) => {
  if (!enabled || typeof req.path !== 'string' || req.path.replace(/\/$/, '').toLowerCase() !== '/graphql') return next();
  try { assertAllowedGraphQLRequest({ method: req.method, body: req.body, operationName: req.body?.operationName }); next(); }
  catch (error) { if (error instanceof OperationGateError) return res.status(400).json({ error: error.message }); return next(error); }
};
