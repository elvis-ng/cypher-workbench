import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createManagedExecutor } from '../api/src/security/managedTarget.js';

const executorFor = records => createManagedExecutor({
  driver: {
    session: () => ({
      run: () => ({
        subscribe({ onNext, onCompleted }) {
          for (const record of records) onNext(record);
          onCompleted();
        }
      }),
      async close() {}
    })
  },
  database: 'targetdb'
});

test('given ordered record keys when query returns then native headers preserve column order', async () => {
  const execute = executorFor([{ keys: ['second', 'first'], toObject: () => ({ first: 0, second: false }) }]);
  const result = await execute({ cypherQuery: 'RETURN false AS second, 0 AS first' });
  assert.deepEqual(result.headers, ['second', 'first']);
  assert.deepEqual(result.rows, [{ first: 0, second: false }]);
  assert.equal(result.numRows, 1);
});

test('given no records when query returns then native result contains empty headers', async () => {
  const result = await executorFor([])({ cypherQuery: 'MATCH (n) WHERE false RETURN n' });
  assert.deepEqual(result, { headers: [], rows: [], numRows: 0 });
});
