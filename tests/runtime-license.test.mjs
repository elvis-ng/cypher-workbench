import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareRuntimeLicense } from '../api/src/security/runtimeLicense.js';

test('given injected license when runtime prepares then writes private temporary file and removes environment secret', () => {
  const env = { WORKBENCH_LICENSE: 'synthetic-signed-license' };
  let received;
  prepareRuntimeLicense(env, (file, content, options) => { received = { file, content, options }; });
  assert.deepEqual(received, { file: '/tmp/workbench-license', content: 'synthetic-signed-license', options: { mode: 0o600, flag: 'wx' } });
  assert.equal(env.LICENSE_FILE, '/tmp/workbench-license');
  assert.equal(Object.hasOwn(env, 'WORKBENCH_LICENSE'), false);
});

test('given mounted license when runtime prepares then preserves mount without writing', () => {
  const env = { LICENSE_FILE: '/run/secrets/workbench-license' };
  prepareRuntimeLicense(env, () => assert.fail('must not write'));
  assert.equal(env.LICENSE_FILE, '/run/secrets/workbench-license');
});

test('given secret write failure when runtime prepares then removes injected secret and fails closed', () => {
  const env = { WORKBENCH_LICENSE: 'synthetic-signed-license' };
  assert.throws(() => prepareRuntimeLicense(env, () => { throw new Error('private detail'); }), /Workbench license initialization failed/);
  assert.equal(Object.hasOwn(env, 'WORKBENCH_LICENSE'), false);
});
