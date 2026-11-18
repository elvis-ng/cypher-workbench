import { Semaphore } from './semaphore.js';

const FORBIDDEN_CONNECTION_FIELDS = new Set(['id', 'url', 'databaseName', 'encrypted', 'proxyThroughAppServer', 'encryptedUser', 'encryptedUserPublicKey', 'encryptedPassword', 'encryptedPasswordPublicKey']);
export const TARGET_QUERY_TIMEOUT_MS = 30_000;
export const TARGET_MAX_RESULT_BYTES = 16 * 1024 * 1024;
export const TARGET_MAX_CONCURRENCY = 2;
export class ManagedTargetError extends Error { constructor(message) { super(message); this.name = 'ManagedTargetError'; } }

export const targetConfigFromEnvironment = env => {
  for (const name of ['WORKBENCH_TARGET_URI', 'WORKBENCH_TARGET_USER', 'WORKBENCH_TARGET_PASSWORD', 'WORKBENCH_TARGET_DATABASE']) if (!env[name]) throw new ManagedTargetError(`missing managed target configuration: ${name}`);
  return Object.freeze({ uri: env.WORKBENCH_TARGET_URI, user: env.WORKBENCH_TARGET_USER, password: env.WORKBENCH_TARGET_PASSWORD, database: env.WORKBENCH_TARGET_DATABASE });
};
export const validateManagedInput = input => {
  if (!input || typeof input.cypherQuery !== 'string' || !input.cypherQuery.trim()) throw new ManagedTargetError('Cypher query is required');
  if (input.dbConnection && Object.keys(input.dbConnection).length) throw new ManagedTargetError('client connection selection is forbidden');
  return { query: input.cypherQuery, parameters: input.cypherParameters ?? {} };
};
const assertLimit = (name, value, cap) => { if (!Number.isInteger(value) || value <= 0) throw new ManagedTargetError(`managed target ${name} must be positive`); if (value > cap) throw new ManagedTargetError(`managed target ${name} exceeds hard cap`); };

export const createManagedExecutor = ({ driver, database, maxConcurrency = TARGET_MAX_CONCURRENCY, timeoutMs = TARGET_QUERY_TIMEOUT_MS, maxResultBytes = TARGET_MAX_RESULT_BYTES }) => {
  if (!driver || !database) throw new ManagedTargetError('managed target driver is required');
  assertLimit('concurrency', maxConcurrency, TARGET_MAX_CONCURRENCY); assertLimit('timeout', timeoutMs, TARGET_QUERY_TIMEOUT_MS); assertLimit('result limit', maxResultBytes, TARGET_MAX_RESULT_BYTES);
  const semaphore = new Semaphore(maxConcurrency);
  return async input => {
    const { query, parameters } = validateManagedInput(input);
    let release; let session; let closeError;
    try {
      try { release = semaphore.acquire(); } catch (error) { throw new ManagedTargetError(error.message); }
      session = driver.session({ database, defaultAccessMode: 'READ' });
      const result = session.run(query, parameters, { timeout: timeoutMs, routing: 'READ' });
      if (typeof result.subscribe !== 'function') throw new ManagedTargetError('managed target driver streaming API required');
      const rows = []; let headers = []; let bytes = 2; let overflow = false;
      await new Promise((resolve, reject) => {
        result.subscribe({ onNext(record) { if (overflow) return; const row = record.toObject ? record.toObject() : record; if (rows.length === 0) headers = record.keys ? [...record.keys] : Object.keys(row); const encoded = JSON.stringify(row); bytes += Buffer.byteLength(encoded, 'utf8') + (rows.length ? 1 : 0); if (bytes > maxResultBytes) { overflow = true; session.close().catch(() => {}); reject(new ManagedTargetError('managed target result exceeds limit')); return; } rows.push(row); }, onError: reject, onCompleted: resolve });
        if (overflow) session.close().catch(() => {});
      });
      return { headers, rows, numRows: rows.length };
    } finally {
      try { if (session) await session.close(); } catch (error) { closeError = error; }
      release?.();
      if (closeError) throw closeError;
    }
  };
};
