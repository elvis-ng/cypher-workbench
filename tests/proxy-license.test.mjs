import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proxyLicenseHandler } from '../api/src/security/proxyLicense.js';

const identity = { 'x-elvis-workbench-email': 'owner@example.test', 'x-elvis-workbench-organization': 'fixture' };
const invoke = (headers, license) => {
  const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  proxyLicenseHandler({ organization: 'fixture', getLicense: () => license })({ headers }, response);
  return response;
};
test('given trusted identity and signed local license then exposes only public license fields', () => {
  const response = invoke(identity, { licensed_product: 'Cypher Workbench', license_version: '1', license_type: 'Basic', protected: 'never-return' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { product: 'Cypher Workbench', version: '1', type: 'Basic' });
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
test('given bundled Labs entitlement when trusted session requests it then exposes public Labs fields', () => {
  const response = invoke(identity, { licensed_product: 'Cypher Workbench', license_version: '1', license_type: 'Labs' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.type, 'Labs');
});
test('given missing identity then denies license disclosure', () => { assert.equal(invoke({}, {}).statusCode, 403); });
test('given cloud or unknown entitlement then fails closed', () => {
  for (const type of ['Cloud', 'unknown', undefined]) assert.equal(invoke(identity, { license_type: type }).statusCode, 503);
});
