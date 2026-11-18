import express from 'express';
import http from 'http';
import { ApolloServer } from 'apollo-server-express';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLScalarType, Kind } from 'graphql';
import dbConnectionTypeDefs from '../types/dbConnection.js';
import { createManagedResolvers } from './managedResolvers.js';
import { httpOperationGate } from './httpOperationGate.js';
import { proxySessionHandler } from './proxySession.js';

const ORGANIZATION = 'elvis-test';
const EMAIL = 'operator@example.com';

const nativeSupportTypeDefs = `
  directive @exclude on OBJECT | FIELD_DEFINITION | INPUT_OBJECT | INPUT_FIELD_DEFINITION | ENUM | ENUM_VALUE | SCALAR
  type UserRole { id: ID }
`;

const jsonScalar = new GraphQLScalarType({
  name: 'JSON',
  serialize: value => value,
  parseValue: value => value,
  parseLiteral: node => {
    if (node.kind === Kind.STRING) return JSON.parse(node.value);
    return null;
  }
});

const request = (server, method, path, body, headers = {}) => new Promise((resolve, reject) => {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const address = server.address();
  const req = http.request({
    hostname: address.address,
    port: address.port,
    method,
    path,
    headers: {
      ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
      ...headers
    }
  }, response => {
    let text = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { text += chunk; });
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: text ? JSON.parse(text) : null }));
  });
  req.on('error', reject);
  if (payload) req.write(payload);
  req.end();
});

describe('managed proxy HTTP contract', () => {
  let server;
  let execute;

  beforeAll(async () => {
    execute = jest.fn(async input => ({ headers: ['name', 'count'], rows: [{ name: 'neo', count: 2 }], numRows: 1, input }));
    const managed = createManagedResolvers({ execute });
    const schema = makeExecutableSchema({
      typeDefs: [nativeSupportTypeDefs, dbConnectionTypeDefs],
      resolvers: { ...managed, JSON: jsonScalar }
    });
    const apollo = new ApolloServer({ schema, context: ({ req }) => ({
      email: req.headers['x-elvis-workbench-email'],
      organization: req.headers['x-elvis-workbench-organization'],
      headers: req.headers
    }) });
    await apollo.start();
    const app = express();
    app.use(express.json());
    app.get('/session', proxySessionHandler(ORGANIZATION));
    app.use(httpOperationGate(true));
    apollo.applyMiddleware({ app });
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  });

  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

  const trusted = {
    'x-elvis-workbench-email': EMAIL,
    'x-elvis-workbench-organization': ORGANIZATION
  };

  test('executes trusted aliased query with fragment and returns native headers and rows', async () => {
    const response = await request(server, 'POST', '/graphql', {
      operationName: 'ReadRows',
      query: 'query ReadRows($input: CypherQueryInput) { rows: executeCypherQuery(input: $input) { ...ResultFields } } fragment ResultFields on CypherExecutionResult { headers rows numRows }',
      variables: { input: { cypherQuery: 'MATCH (n) RETURN n' } }
    }, trusted);
    expect(response.status).toBe(200);
    expect(response.body.data.rows).toEqual({ headers: ['name', 'count'], rows: [{ name: 'neo', count: 2 }], numRows: 1 });
    expect(execute).toHaveBeenCalledWith({ cypherQuery: 'MATCH (n) RETURN n' });
  });

  test('rejects connection-selection input before resolver execution', async () => {
    const response = await request(server, 'POST', '/graphql', {
      operationName: 'ForbiddenConnection',
      query: 'query ForbiddenConnection { executeCypherQuery(input: { cypherQuery: "RETURN 1", dbConnection: { url: "bolt://untrusted", id: "x" } }) { numRows } }'
    }, trusted);
    expect(response.status).toBe(200);
    expect(response.body.errors[0].message).toMatch(/client connection selection is forbidden/);
  });

  test.each([
    ['batch', 'POST', '/graphql', [{ query: 'query ReadRows { executeCypherQuery(input: { cypherQuery: "RETURN 1" }) { numRows } }' }]],
    ['GET mutation', 'GET', '/graphql', { query: 'mutation Change { createDBConnection(input: { url: "x", name: "x", user: "x", password: "x", isPrivate: true }) { id } }' }]
  ])('rejects %s at HTTP gate', async (_name, method, path, body) => {
    const response = await request(server, method, path, body, trusted);
    expect(response.status).toBe(400);
    expect(response.body.error).toBeTruthy();
  });

  test('rejects untrusted session headers with 403', async () => {
    const response = await request(server, 'GET', '/session');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Workbench administrator session required' });
  });
});
