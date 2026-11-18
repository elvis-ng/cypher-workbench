import { parse, Kind } from 'graphql';

// Target reads and isolated saved-work resolvers are separate capabilities.
const ALLOWED_QUERY_ROOTS = new Set(['executeCypherQuery', 'getSchema', 'listCypherStatementsX', 'searchCypherStatementsX', 'listGraphDocsX', 'searchGraphDocsX', 'loadGraphDoc', 'loadGraphDocAndDefaultView', 'loadLastOpenedGraphDoc', 'loadLastOpenedGraphDocAndDefaultView']);
const ALLOWED_METADATA_MUTATIONS = new Set(['saveGraphDoc', 'saveGraphDocMetadata', 'saveGraphDocRootsWithMetadata', 'saveGraphDocWithFullMetadata']);

export class OperationGateError extends Error {
  constructor(message) { super(message); this.name = 'OperationGateError'; }
}

function collectFields(selectionSet, fragments, active, fields) {
  if (!selectionSet) throw new OperationGateError('GraphQL selection is required');
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) fields.push(selection.name.value);
    else if (selection.kind === Kind.INLINE_FRAGMENT) collectFields(selection.selectionSet, fragments, active, fields);
    else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const name = selection.name.value;
      if (active.has(name)) throw new OperationGateError('GraphQL fragment cycle is not allowed');
      const fragment = fragments.get(name);
      if (!fragment) throw new OperationGateError('Unknown GraphQL fragment');
      active.add(name);
      collectFields(fragment.selectionSet, fragments, active, fields);
      active.delete(name);
    }
  }
}

export function assertAllowedGraphQLRequest({ method, body, operationName } = {}) {
  if (method === 'GET' && typeof body === 'string' && /\bmutation\b/.test(body)) {
    throw new OperationGateError('GraphQL mutations require POST');
  }
  if (Array.isArray(body)) throw new OperationGateError('GraphQL batching is disabled');
  if (!body || typeof body.query !== 'string') throw new OperationGateError('GraphQL query is required');

  let document;
  try { document = parse(body.query); } catch { throw new OperationGateError('Invalid GraphQL document'); }
  const operations = document.definitions.filter(definition => definition.kind === Kind.OPERATION_DEFINITION);
  const fragmentDefinitions = document.definitions.filter(definition => definition.kind === Kind.FRAGMENT_DEFINITION);
  const fragments = new Map();
  for (const fragment of fragmentDefinitions) {
    const name = fragment.name.value;
    if (fragments.has(name)) throw new OperationGateError('Duplicate GraphQL fragment');
    fragments.set(name, fragment);
  }
  const selected = operationName ? operations.filter(operation => operation.name?.value === operationName) : operations;
  if (selected.length !== 1 || operations.length !== 1) {
    throw new OperationGateError('Exactly one named GraphQL operation is required');
  }
  const operation = selected[0];
  if (!operation.name) throw new OperationGateError('Exactly one named GraphQL operation is required');
  if (operation.operation !== 'query' && operation.operation !== 'mutation') throw new OperationGateError('GraphQL operation is not allowed');
  if (operation.operation === 'mutation' && method !== 'POST') throw new OperationGateError('GraphQL mutations require POST');
  const allowedRoots = operation.operation === 'mutation' ? ALLOWED_METADATA_MUTATIONS : ALLOWED_QUERY_ROOTS;
  const fields = [];
  collectFields(operation.selectionSet, fragments, new Set(), fields);
  if (fields.length === 0 || fields.some(field => !allowedRoots.has(field))) {
    throw new OperationGateError('GraphQL operation is not allowed');
  }
  return fields;
}
