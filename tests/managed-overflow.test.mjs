import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createManagedExecutor } from '../api/src/security/managedTarget.js';

test('given stream overflow when driver continues callbacks then ignores all later records', async () => {
  let serialized = 0;
  let closed = 0;
  const execute = createManagedExecutor({
    database: 'synthetic', maxResultBytes: 20,
    driver: { session: () => ({
      run: () => ({ subscribe({ onNext, onCompleted }) {
        onNext({ toObject: () => ({ value: 'x'.repeat(100) }) });
        for (let i = 0; i < 100; i += 1) onNext({ toObject: () => { serialized += 1; return { value: 'late' }; } });
        onCompleted();
      } }),
      close: async () => { closed += 1; },
    }) },
  });
  await assert.rejects(() => execute({ cypherQuery: 'RETURN 1' }), /result exceeds limit/);
  assert.equal(serialized, 0);
  assert.ok(closed > 0);
});
