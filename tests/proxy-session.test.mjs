import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proxySessionHandler } from '../api/src/security/proxySession.js';

const invoke = headers => {
  let status = 200;
  let body;
  const response = {
    setHeader() {},
    status(value) { status = value; return this; },
    json(value) { body = value; return this; }
  };
  proxySessionHandler('dev-org')({ headers }, response);
  return { status, body };
};

test('given trusted administrator identity when session requested then returns no native token or credentials', () => {
  assert.deepEqual(invoke({
    'x-elvis-workbench-email': 'admin@example.com',
    'x-elvis-workbench-organization': 'dev-org'
  }), { status: 200, body: { email: 'admin@example.com', organization: 'dev-org', managedTarget: true } });
});

test('given no trusted identity when session requested then denies access', () => {
  assert.equal(invoke({}).status, 403);
});

test('given different organization when session requested then denies access', () => {
  assert.equal(invoke({
    'x-elvis-workbench-email': 'admin@example.com',
    'x-elvis-workbench-organization': 'qa-org'
  }).status, 403);
});
