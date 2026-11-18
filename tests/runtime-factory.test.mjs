import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createManagedRuntime } from '../api/src/security/runtimeFactory.js';

const environment = uri => ({
  WORKBENCH_TARGET_URI: uri,
  WORKBENCH_TARGET_USER: 'reader',
  WORKBENCH_TARGET_PASSWORD: 'synthetic-password',
  WORKBENCH_TARGET_DATABASE: 'targetdb'
});

for (const uri of ['bolt://target', 'neo4j://target', 'bolt+s://target', 'neo4j+s://target']) {
  test(`given ${uri} when runtime executes then only target driver receives query`, async () => {
    const metadataDriver = { session() { assert.fail('metadata driver must never execute target query'); } };
    let factoryCall;
    let sessionOptions;
    const targetDriver = {
      session(options) {
        sessionOptions = options;
        return {
          run(query, parameters) {
            assert.equal(query, 'RETURN $value');
            assert.deepEqual(parameters, { value: 1 });
            return {
              then() { assert.fail('streaming result must not be materialized'); },
              subscribe({ onNext, onCompleted }) {
                onNext({ toObject: () => ({ value: 1 }) });
                onCompleted();
              }
            };
          },
          async close() {}
        };
      }
    };
    const runtime = createManagedRuntime({
      env: environment(uri), metadataDriver,
      driverFactory(targetUri, auth, config) {
        factoryCall = { targetUri, auth, config };
        return targetDriver;
      },
      authFactory: (user, password) => ({ principal: user, credentials: password })
    });
    assert.equal(runtime.metadataDriver, metadataDriver);
    assert.equal(runtime.targetDriver, targetDriver);
    assert.notEqual(runtime.targetDriver, metadataDriver);
    assert.equal(factoryCall.targetUri, uri);
    assert.deepEqual(factoryCall.auth, { principal: 'reader', credentials: 'synthetic-password' });
    if (uri.includes('+s:')) {
      assert.equal(Object.hasOwn(factoryCall.config, 'encrypted'), false,
        'secure URI owns encryption; Neo4j rejects explicit encryption config');
    } else {
      assert.equal(factoryCall.config.encrypted, false,
        'private Bolt connection matches the existing backend encryption setting');
    }
    const result = await runtime.executor({
      cypherQuery: 'RETURN $value', cypherParameters: { value: 1 }
    });
    assert.deepEqual(result.rows, [{ value: 1 }]);
    assert.equal(result.numRows, 1);
    assert.deepEqual(sessionOptions, { database: 'targetdb', defaultAccessMode: 'READ' });
  });
}
