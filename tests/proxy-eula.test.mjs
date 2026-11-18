import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProxyEulaHandlers } from '../api/src/security/proxyEula.js';

const trusted = { headers: { 'x-elvis-workbench-email': 'reader@example.com', 'x-elvis-workbench-organization': 'qa' } };
const response = () => ({ code: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const fixture = () => {
  let acceptance = null;
  const metadata = {
    async getEulaAcceptance(context) { assert.equal(context.email, 'reader@example.com'); return acceptance; },
    async acceptEula(context, version) { assert.equal(context.organization, 'qa'); acceptance = { version }; return acceptance; },
  };
  return createProxyEulaHandlers({ organization: 'qa', metadata, version: 'eula-sha256-fixture' });
};

test('given no acceptance when status read then reports false without writing', async () => {
  const res = response();
  await fixture().status(trusted, res);
  assert.equal(res.body.accepted, false);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('given deliberate acceptance when posted then records server version for trusted identity', async () => {
  const handlers = fixture();
  const accepted = response();
  await handlers.accept(trusted, accepted);
  assert.deepEqual(accepted.body, { accepted: true });
  const status = response();
  await handlers.status(trusted, status);
  assert.deepEqual(status.body, { accepted: true });
});

test('given untrusted identity when EULA accessed then denies without persistence', async () => {
  const handlers = fixture();
  for (const handler of [handlers.status, handlers.accept]) {
    const res = response();
    await handler({ headers: {} }, res);
    assert.equal(res.code, 403);
  }
});

test('given changed server EULA version when status read then requires new acceptance', async () => {
  const handlers = createProxyEulaHandlers({ organization: 'qa', version: 'new', metadata: { async getEulaAcceptance() { return { version: 'old' }; } } });
  const res = response();
  await handlers.status(trusted, res);
  assert.equal(res.body.accepted, false);
});

test('given metadata failure when EULA accessed then returns redacted unavailable response', async () => {
  const handlers = createProxyEulaHandlers({ organization: 'qa', version: 'new', metadata: { async getEulaAcceptance() { throw new Error('synthetic private detail'); } } });
  const res = response();
  await handlers.status(trusted, res);
  assert.equal(res.code, 503);
  assert.deepEqual(res.body, { error: 'Workbench EULA unavailable' });
});
