import assert from 'node:assert/strict';
import { createManagedResolvers } from '../api/src/security/managedResolvers.js';
import { createManagedExecutor } from '../api/src/security/managedTarget.js';
let count=0;const test=async(n,f)=>{await f();count++;console.log(`ok ${count} - ${n}`)};
const identity={email:'u@example.com',organization:'dev',headers:{'x-elvis-workbench-email':'u@example.com','x-elvis-workbench-organization':'dev'}};
await test('composes resolver with real managed executor',async()=>{let seen;const result={then(){throw new Error('materialized')},subscribe({onNext,onCompleted}){onNext({toObject:()=>({n:1})});onCompleted()}};const executor=createManagedExecutor({driver:{session:opts=>{seen=opts;return {run:(q,p,o)=>{assert.equal(q,'RETURN 1');assert.deepEqual(p,{});assert.equal(o.timeout,30000);return result},close:async()=>{}}}},database:'primary'});const r=createManagedResolvers({execute:executor});const out=await r.Query.executeCypherQuery(null,{input:{cypherQuery:'RETURN 1',cypherParameters:{}}},identity);assert.equal(out.numRows,1);assert.deepEqual(seen,{database:'primary',defaultAccessMode:'READ'})});
console.log(`executed ${count} tests`);
