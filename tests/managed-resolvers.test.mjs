import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createManagedResolvers } from '../api/src/security/managedResolvers.js';

const trusted = {
  email: 'u@example.com', organization: 'dev',
  headers: { 'x-elvis-workbench-email': 'u@example.com', 'x-elvis-workbench-organization': 'dev' },
};

test('given managed query when executed then uses only injected target executor', async () => {
  let seen;
  const resolvers = createManagedResolvers({ execute: async input => { seen = input; return { rows: [], numRows: 0 }; } });
  assert.deepEqual(await resolvers.Query.executeCypherQuery(null, { input: { cypherQuery: 'RETURN 1' } }, trusted), { rows: [], numRows: 0 });
  assert.equal(seen.cypherQuery, 'RETURN 1');
});

test('given client target or malformed identity when executed then rejects before target access', async () => {
  const resolvers = createManagedResolvers({ execute: async () => { assert.fail('must not run'); } });
  await assert.rejects(() => resolvers.Query.executeCypherQuery(null, { input: { cypherQuery: 'RETURN 1', dbConnection: { url: 'bolt://evil' } } }, trusted), /client connection selection/);
  await assert.rejects(() => resolvers.Query.executeCypherQuery(null, { input: { cypherQuery: 'RETURN 1' } }, { ...trusted, email: 'u', headers: { ...trusted.headers, 'x-elvis-workbench-email': 'u' } }), /malformed/);
});

test('given trusted schema request when executed then returns native topology from fixed target query', async () => {
  const nodes = [{ identity: { low: 1, high: 0 }, labels: ['Vehicle'], properties: { name: 'Vehicle' } }];
  const relationships = [{ identity: { low: 2, high: 0 }, start: { low: 1, high: 0 }, end: { low: 1, high: 0 }, type: 'RELATES_TO', properties: {} }];
  let seen;
  const resolvers = createManagedResolvers({ execute: async input => { seen = input; return { rows: [{ nodes, relationships }], numRows: 1 }; } });
  const result = await resolvers.Query.getSchema(null, { input: {} }, trusted);
  assert.deepEqual(seen, { cypherQuery: 'CALL db.schema.visualization() YIELD nodes, relationships RETURN nodes, relationships', cypherParameters: {} });
  assert.equal(result.cypherFunction, 'db.schema.visualization');
  assert.deepEqual(JSON.parse(result.jsonSchema), { nodes, relationships });
});

test('given empty schema when executed then returns native empty arrays', async () => {
  const resolvers = createManagedResolvers({ execute: async () => ({ rows: [], numRows: 0 }) });
  assert.deepEqual(JSON.parse((await resolvers.Query.getSchema(null, {}, trusted)).jsonSchema), { nodes: [], relationships: [] });
});

test('given untrusted identity or schema override when requested then denies without executing', async () => {
  const resolvers = createManagedResolvers({ execute: async () => { assert.fail('must not run'); } });
  await assert.rejects(() => resolvers.Query.getSchema(null, {}, { ...trusted, email: 'other@example.com' }), /identity mismatch/);
  for (const input of [{ url: 'bolt://evil' }, { dbConnection: {} }, { cypherQuery: 'RETURN 1' }]) {
    await assert.rejects(() => resolvers.Query.getSchema(null, { input }, trusted), /client schema selection/);
  }
});

test('given target failure when schema requested then propagates failure without fallback driver', async () => {
  const resolvers = createManagedResolvers({ execute: async () => { throw new Error('procedure denied'); } });
  await assert.rejects(() => resolvers.Query.getSchema(null, {}, trusted), /procedure denied/);
});
