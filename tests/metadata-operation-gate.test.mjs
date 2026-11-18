import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertAllowedGraphQLRequest } from '../api/src/security/operationGate.js';

for (const root of ['listCypherStatementsX', 'searchCypherStatementsX', 'loadGraphDoc', 'loadGraphDocAndDefaultView', 'loadLastOpenedGraphDoc', 'loadLastOpenedGraphDocAndDefaultView']) {
  test(`given native metadata query ${root} when posted then allows its scoped resolver`, () => {
    assert.deepEqual(assertAllowedGraphQLRequest({ method: 'POST', body: { query: `query Load { alias: ${root} { key } }` } }), [root]);
  });
}
for (const root of ['saveGraphDoc', 'saveGraphDocMetadata', 'saveGraphDocRootsWithMetadata', 'saveGraphDocWithFullMetadata']) {
  test(`given native metadata mutation ${root} when posted then allows only metadata resolver`, () => {
    assert.deepEqual(assertAllowedGraphQLRequest({ method: 'POST', body: { query: `mutation Save { ${root} }` } }), [root]);
    assert.throws(() => assertAllowedGraphQLRequest({ method: 'GET', body: { query: `mutation Save { ${root} }` } }));
  });
}
test('given metadata alias disguising connection administration then denies request', () => {
  assert.throws(() => assertAllowedGraphQLRequest({ method: 'POST', body: { query: 'mutation Save { saveGraphDoc: createDBConnection }' } }));
});
