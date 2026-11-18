import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createManagedMetadata } from '../api/src/security/managedMetadata.js';

const context = { email: 'reader@example.com', organization: 'qa' };
test('given metadata driver stalls when reading then deadline closes session and releases admission', async () => {
  let closed = 0;
  let sessions = 0;
  const metadata = createManagedMetadata({ database: 'metadata', organization: 'qa', timeoutMs: 20, maxConcurrency: 1,
    driver: { session() { sessions += 1; return { run: () => new Promise(() => {}), close: async () => { closed += 1; } }; } },
  });
  await assert.rejects(() => metadata.getEulaAcceptance(context), /metadata deadline exceeded/);
  await assert.rejects(() => metadata.getEulaAcceptance(context), /metadata deadline exceeded/);
  assert.equal(sessions, 2);
  assert.equal(closed, 2);
});
