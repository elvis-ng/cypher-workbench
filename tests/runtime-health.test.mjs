import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRuntimeHealth } from '../api/src/security/runtimeHealth.js';

const driver = (calls, reject = false) => ({
  session(options) {
    calls.push(options);
    return {
      async run(query, params, config) {
        assert.equal(query, 'RETURN 1 AS ready');
        assert.deepEqual(params, {});
        assert.ok(config.timeout <= 1500);
        if (reject) throw new Error('secret connection detail');
        return { records: [{ get: () => 1 }] };
      },
      async close() { calls.push('close'); }
    };
  },
  async close() { calls.push('driver-close'); }
});

test('given two healthy databases when checked then probes fixed databases read-only and closes sessions', async () => {
  const targetCalls = []; const metadataCalls = [];
  const health = createRuntimeHealth({ targetDriver: driver(targetCalls), metadataDriver: driver(metadataCalls), targetDatabase: 'app', metadataDatabase: 'workbench' });
  assert.equal(await health.check(), true);
  assert.deepEqual(targetCalls, [{ database: 'app', defaultAccessMode: 'READ' }, 'close']);
  assert.deepEqual(metadataCalls, [{ database: 'workbench', defaultAccessMode: 'READ' }, 'close']);
  await health.close();
  assert.equal(await health.check(), false);
  assert.equal(targetCalls.at(-1), 'driver-close');
  assert.equal(metadataCalls.at(-1), 'driver-close');
});

test('given database failure when checked then reports unavailable without propagating secrets', async () => {
  const calls = [];
  const health = createRuntimeHealth({ targetDriver: driver(calls, true), metadataDriver: driver([]), targetDatabase: 'app', metadataDatabase: 'workbench' });
  assert.equal(await health.check(), false);
  assert.ok(calls.includes('close'));
});

test('given overlapping readiness calls when checked then shares one bounded probe', async () => {
  let runs = 0; let resolve;
  const blockedDriver = { session() { return { run() { runs++; return new Promise(done => { resolve = done; }); }, async close() {} }; }, async close() {} };
  const health = createRuntimeHealth({ targetDriver: blockedDriver, metadataDriver: driver([]), targetDatabase: 'app', metadataDatabase: 'workbench' });
  const first = health.check(); const second = health.check();
  assert.equal(runs, 1);
  resolve({ records: [{ get: () => 1 }] });
  assert.equal(await first, true); assert.equal(await second, true);
  assert.equal(runs, 1);
});
