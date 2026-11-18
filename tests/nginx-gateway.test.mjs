import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const config = readFileSync(new URL('../ui/nginx.conf', import.meta.url), 'utf8');
test('given Java strips gateway prefix then nginx handles private API root paths', () => {
  for (const route of ['session', 'license', 'health/ready', 'graphql']) {
    assert.ok(config.includes(`location = /${route} {`), `missing stripped ${route} route`);
    assert.ok(config.includes(`proxy_pass http://127.0.0.1:4000/${route};`));
  }
  assert.equal(config.includes('location = /backoffice/cypher-workbench/'), false);
});
