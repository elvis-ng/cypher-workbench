jest.mock('../auth/authUtil', () => ({ getAuthMethod: () => 'proxy' }));
jest.mock('../persistence/graphql/GraphQLDBConnection', () => ({
  executeCypherQuery: jest.fn((id, connection, query, params, callback) => callback({ success: true, headers: ['connected'], rows: [{ connected: 1 }], numRows: 1 }))
}));
jest.mock('neo4j-driver', () => ({ Integer: jest.fn() }));
jest.mock('./encryption', () => ({ encryptAsymmetricOnlyWithVersion: jest.fn(), getUserNameAndPasswordLocally: jest.fn() }));

test('proxy connection uses managed routing and bounded connectivity query', async () => {
  const { graphQLConnectToNeo, getCurrentConnectionInfo } = require('./Cypher');
  const result = await new Promise((resolve, reject) => graphQLConnectToNeo({ name: 'managed' }, resolve, reject));
  expect(result).toEqual({ proxy: true });
  expect(getCurrentConnectionInfo('managed-target')).toMatchObject({
    managedTarget: true,
    graphQLNeoProxy: true,
    id: 'managed-target'
  });
  const { executeCypherQuery } = require('../persistence/graphql/GraphQLDBConnection');
  expect(executeCypherQuery.mock.calls[0][2]).toBe('RETURN 1 as connected');
});
