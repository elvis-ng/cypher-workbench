import { assertAllowedGraphQLRequest, OperationGateError } from './operationGate';

const allows = query => assertAllowedGraphQLRequest({ method: 'POST', body: { query } });
const rejects = (request, message) => expect(() => assertAllowedGraphQLRequest(request)).toThrow(new OperationGateError(message));

test('allows exact read operation used by native UI', () => {
  expect(allows('query ExecuteCypherQuery { executeCypherQuery }')).toEqual(['executeCypherQuery']);
  expect(allows('query GetSchema { alias: getSchema }')).toEqual(['getSchema']);
});
test('rejects mutations over GET and POST', () => {
  rejects({ method: 'GET', body: 'mutation CreateDBConnection { CreateDBConnection }' }, 'GraphQL mutations require POST');
  rejects({ method: 'POST', body: { query: 'mutation SaveGraphDoc { SaveGraphDoc }' } }, 'Only read-only GraphQL queries are allowed');
});
test('rejects batches, ambiguous operations, aliases, fragments, and unknown roots', () => {
  rejects({ method: 'POST', body: [{ query: 'query ExecuteCypherQuery { ExecuteCypherQuery }' }] }, 'GraphQL batching is disabled');
  rejects({ method: 'POST', body: { query: 'query A { ExecuteCypherQuery } query B { GetSchema }' } }, 'Exactly one named GraphQL operation is required');
  rejects({ method: 'POST', body: { query: 'query A { alias: createDBConnection }' } }, 'GraphQL operation is not allowed');
  rejects({ method: 'POST', body: { query: 'query A { executeCypherQuery ...More } fragment More on Query { unknownRoot }' } }, 'GraphQL operation is not allowed');
  rejects({ method: 'POST', body: { query: 'query A { ...Missing }' } }, 'Unknown GraphQL fragment');
  rejects({ method: 'POST', body: { query: 'query A { ...Loop } fragment Loop on Query { ...Loop }' } }, 'GraphQL fragment cycle is not allowed');
});
test('rejects connection administration and transfer roots', () => {
  rejects({ method: 'POST', body: { query: 'query A { CreateDBConnection }' } }, 'GraphQL operation is not allowed');
  rejects({ method: 'POST', body: { query: 'query A { runNeo4jToNeo4j }' } }, 'GraphQL operation is not allowed');
  rejects({ method: 'POST', body: { query: 'query A { executeCypherQuery } fragment F on Query { getSchema } fragment F on Query { getSchema }' } }, 'Duplicate GraphQL fragment');
});
